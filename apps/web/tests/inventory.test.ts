import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";

async function login(email: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie =
    setCookie.map((c) => c.split(";")[0]).join("; ") ||
    (res.headers.get("set-cookie") ?? "")
      .split(",")
      .map((c) => c.split(";")[0].trim())
      .join("; ");
  const data = await res.json();
  expect(res.status).toBe(200);
  return { cookie, staff: data.staff as { activeStoreId: string; storeId: string; role: string } };
}

describe("AUT-38 inventory MVP", () => {
  let storeAId = "";
  let storeBId = "";
  let edamameId = "";
  let chickenAId = "";
  let menuEdamameId = "";
  let menuMomoId = "";

  beforeAll(async () => {
    const brand = await prisma.brand.findFirst({ where: { name: "SHINSO Demo" } });
    expect(brand).toBeTruthy();
    const stores = await prisma.store.findMany({
      where: { brandId: brand!.id },
      orderBy: { createdAt: "asc" },
    });
    storeAId = stores.find((s) => s.name === "シンソウデモ店")?.id ?? stores[0].id;
    storeBId = stores.find((s) => s.name === "シンソウデモ店 B")?.id ?? stores[1].id;

    const edamame = await prisma.ingredient.findFirst({
      where: { storeId: storeAId, name: "枝豆（冷凍）" },
    });
    expect(edamame).toBeTruthy();
    edamameId = edamame!.id;

    const chicken = await prisma.ingredient.findFirst({
      where: { storeId: storeAId, name: "鶏もも肉" },
    });
    expect(chicken).toBeTruthy();
    chickenAId = chicken!.id;

    const items = await prisma.menuItem.findMany({
      where: { category: { storeId: storeAId } },
      select: { id: true, name: true },
    });
    menuEdamameId = items.find((i) => i.name === "枝豆")!.id;
    menuMomoId = items.find((i) => i.name === "もも")!.id;
  });

  it("lists ingredients with onHand for active store", async () => {
    const auth = await login("manager@shinso.demo");
    const res = await fetch(`${BASE}/api/inventory/ingredients`, {
      headers: { cookie: auth.cookie },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ingredients.length).toBeGreaterThanOrEqual(4);
    const eda = data.ingredients.find((i: { name: string }) => i.name === "枝豆（冷凍）");
    expect(eda).toBeTruthy();
    expect(eda.onHand).toBe(1000);
    expect(eda.isLowStock).toBe(true);
  });

  it("CRUD ingredient", async () => {
    const auth = await login("owner@shinso.demo");
    const name = `テスト原料 ${Date.now()}`;
    const create = await fetch(`${BASE}/api/inventory/ingredients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        name,
        unit: "pc",
        lowStockThreshold: 10,
        costYenPerUnit: 50,
      }),
    });
    const created = await create.json();
    expect(create.status).toBe(201);
    expect(created.ingredient.name).toBe(name);
    expect(created.ingredient.onHand).toBe(0);

    const patch = await fetch(`${BASE}/api/inventory/ingredients/${created.ingredient.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({ lowStockThreshold: 5 }),
    });
    expect(patch.status).toBe(200);
    const patched = await patch.json();
    expect(patched.ingredient.lowStockThreshold).toBe(5);

    const del = await fetch(`${BASE}/api/inventory/ingredients/${created.ingredient.id}`, {
      method: "DELETE",
      headers: { cookie: auth.cookie },
    });
    expect(del.status).toBe(200);
  });

  it("inbound then outbound updates onHand", async () => {
    const auth = await login("manager@shinso.demo");
    // create temp ingredient
    const create = await fetch(`${BASE}/api/inventory/ingredients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        name: `出入庫テスト ${Date.now()}`,
        unit: "g",
        lowStockThreshold: 100,
        costYenPerUnit: 1,
      }),
    });
    const { ingredient } = await create.json();
    expect(create.status).toBe(201);

    const inbound = await fetch(`${BASE}/api/inventory/ledger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        ingredientId: ingredient.id,
        qtyDelta: 500,
        reason: "inbound",
      }),
    });
    const inData = await inbound.json();
    expect(inbound.status).toBe(201);
    expect(inData.onHand).toBe(500);

    const outbound = await fetch(`${BASE}/api/inventory/ledger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        ingredientId: ingredient.id,
        qtyDelta: -200,
        reason: "outbound",
      }),
    });
    const outData = await outbound.json();
    expect(outbound.status).toBe(201);
    expect(outData.onHand).toBe(300);

    await prisma.ingredient.delete({ where: { id: ingredient.id } });
  });

  it("rejects outbound that would go negative (409)", async () => {
    const auth = await login("manager@shinso.demo");
    const create = await fetch(`${BASE}/api/inventory/ingredients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        name: `負在庫拒否 ${Date.now()}`,
        unit: "pc",
        lowStockThreshold: 1,
        costYenPerUnit: 1,
      }),
    });
    const { ingredient } = await create.json();

    await fetch(`${BASE}/api/inventory/ledger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        ingredientId: ingredient.id,
        qtyDelta: 10,
        reason: "inbound",
      }),
    });

    const bad = await fetch(`${BASE}/api/inventory/ledger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        ingredientId: ingredient.id,
        qtyDelta: -50,
        reason: "outbound",
      }),
    });
    const data = await bad.json();
    expect(bad.status).toBe(409);
    expect(data.error).toMatch(/在庫不足|負在庫/);
    expect(data.onHand).toBe(10);

    await prisma.ingredient.delete({ where: { id: ingredient.id } });
  });

  it("GET /api/inventory/low-stock lists seeded edamame", async () => {
    const auth = await login("owner@shinso.demo");
    const res = await fetch(`${BASE}/api/inventory/low-stock`, {
      headers: { cookie: auth.cookie },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.count).toBeGreaterThanOrEqual(1);
    const names = (data.alerts as Array<{ name: string }>).map((a) => a.name);
    expect(names).toContain("枝豆（冷凍）");
  });

  it("BOM list includes momo → chicken; rejects invalid menuItemId", async () => {
    const auth = await login("owner@shinso.demo");
    const list = await fetch(`${BASE}/api/inventory/bom`, {
      headers: { cookie: auth.cookie },
    });
    const listData = await list.json();
    expect(list.status).toBe(200);
    expect(
      listData.lines.some(
        (l: { menuItemId: string; ingredientId: string }) =>
          l.menuItemId === menuMomoId && l.ingredientId === chickenAId
      )
    ).toBe(true);

    const bad = await fetch(`${BASE}/api/inventory/bom`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        menuItemId: "invalid_menu_id",
        ingredientId: chickenAId,
        qtyPerItem: 10,
      }),
    });
    expect(bad.status).toBe(400);

    // valid create + delete
    const create = await fetch(`${BASE}/api/inventory/bom`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        menuItemId: menuEdamameId,
        ingredientId: chickenAId,
        qtyPerItem: 1,
      }),
    });
    // may 201 or 400 if already exists from prior run
    if (create.status === 201) {
      const created = await create.json();
      const del = await fetch(`${BASE}/api/inventory/bom/${created.line.id}`, {
        method: "DELETE",
        headers: { cookie: auth.cookie },
      });
      expect(del.status).toBe(200);
    } else {
      expect([400, 201]).toContain(create.status);
    }
  });

  it("store isolation: A ingredients not visible on store B", async () => {
    const auth = await login("brandadmin@shinso.demo");
    // switch to B
    const switchB = await fetch(`${BASE}/api/session/switch-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({ storeId: storeBId }),
    });
    expect(switchB.status).toBe(200);
    const cookieB =
      (switchB.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ") ||
      auth.cookie;

    const resB = await fetch(`${BASE}/api/inventory/ingredients`, {
      headers: { cookie: cookieB },
    });
    const dataB = await resB.json();
    expect(resB.status).toBe(200);
    const namesB = (dataB.ingredients as Array<{ name: string; id: string }>).map((i) => i.name);
    expect(namesB).toContain("鶏もも肉");
    expect(namesB).not.toContain("枝豆（冷凍）");
    expect(namesB).not.toContain("生ビール原液");
    // A edamame id must not be fetchable
    const getA = await fetch(`${BASE}/api/inventory/ingredients/${edamameId}`, {
      headers: { cookie: cookieB },
    });
    expect(getA.status).toBe(404);

    // outbound against A ingredient id while on B → 404
    const ledger = await fetch(`${BASE}/api/inventory/ledger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieB },
      body: JSON.stringify({
        ingredientId: edamameId,
        qtyDelta: -1,
        reason: "outbound",
      }),
    });
    expect(ledger.status).toBe(404);

    // switch back to A — edamame visible
    const switchA = await fetch(`${BASE}/api/session/switch-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieB },
      body: JSON.stringify({ storeId: storeAId }),
    });
    const cookieA =
      (switchA.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ") || cookieB;
    const resA = await fetch(`${BASE}/api/inventory/ingredients`, {
      headers: { cookie: cookieA },
    });
    const dataA = await resA.json();
    expect(dataA.ingredients.some((i: { name: string }) => i.name === "枝豆（冷凍）")).toBe(true);
  });

  it("usage estimate endpoint returns structure", async () => {
    const auth = await login("manager@shinso.demo");
    const res = await fetch(`${BASE}/api/inventory/usage-estimate`, {
      headers: { cookie: auth.cookie },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.estimate).toBeTruthy();
    expect(data.estimate.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(data.estimate.ingredients)).toBe(true);
  });
});
