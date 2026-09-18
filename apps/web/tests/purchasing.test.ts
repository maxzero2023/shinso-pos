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

describe("AUT-39 purchasing", () => {
  let storeAId = "";
  let storeBId = "";
  let chickenAId = "";
  let supplierAId = "";
  /** Isolated low-stock ingredient for PO flow (does not touch seed edamame). */
  let lowIngId = "";
  const lowName = `調達テスト原料 ${Date.now()}`;

  beforeAll(async () => {
    const brand = await prisma.brand.findFirst({ where: { name: "SHINSO Demo" } });
    expect(brand).toBeTruthy();
    const stores = await prisma.store.findMany({
      where: { brandId: brand!.id },
      orderBy: { createdAt: "asc" },
    });
    storeAId = stores.find((s) => s.name === "シンソウデモ店")?.id ?? stores[0].id;
    storeBId = stores.find((s) => s.name === "シンソウデモ店 B")?.id ?? stores[1].id;

    const chicken = await prisma.ingredient.findFirst({
      where: { storeId: storeAId, name: "鶏もも肉" },
    });
    expect(chicken).toBeTruthy();
    chickenAId = chicken!.id;

    const supplier = await prisma.supplier.findFirst({
      where: { storeId: storeAId, name: "デフォルト仕入先" },
    });
    expect(supplier).toBeTruthy();
    supplierAId = supplier!.id;

    // Create isolated ingredient: onHand 100, threshold 400 → suggestedQty 300
    const auth = await login("owner@shinso.demo");
    const create = await fetch(`${BASE}/api/inventory/ingredients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        name: lowName,
        unit: "g",
        lowStockThreshold: 400,
        costYenPerUnit: 1,
      }),
    });
    const created = await create.json();
    expect(create.status).toBe(201);
    lowIngId = created.ingredient.id;

    const inbound = await fetch(`${BASE}/api/inventory/ledger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        ingredientId: lowIngId,
        qtyDelta: 100,
        reason: "inbound",
      }),
    });
    expect(inbound.status).toBe(201);
  });

  it("suggestions from low stock: qty = max(0, threshold - onHand)", async () => {
    const auth = await login("manager@shinso.demo");
    const res = await fetch(`${BASE}/api/purchasing/suggestions`, {
      headers: { cookie: auth.cookie },
    });
    const data = await res.json();
    expect(res.status).toBe(200);

    // Seed edamame still low (untouched by this suite)
    const eda = data.suggestions.find(
      (s: { name: string }) => s.name === "枝豆（冷凍）"
    );
    expect(eda).toBeTruthy();
    expect(eda.suggestedQty).toBe(Math.max(0, eda.lowStockThreshold - eda.onHand));
    expect(eda.suggestedQty).toBe(500);

    const low = data.suggestions.find(
      (s: { ingredientId: string }) => s.ingredientId === lowIngId
    );
    expect(low).toBeTruthy();
    expect(low.onHand).toBe(100);
    expect(low.lowStockThreshold).toBe(400);
    expect(low.suggestedQty).toBe(300);
  });

  it("create draft, edit qty, receive increases onHand + ledger + audit", async () => {
    const auth = await login("owner@shinso.demo");

    const beforeAgg = await prisma.stockLedger.aggregate({
      where: { ingredientId: lowIngId },
      _sum: { qtyDelta: true },
    });
    const onHandBefore = Number(beforeAgg._sum.qtyDelta ?? 0);

    const create = await fetch(`${BASE}/api/purchasing/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        supplierId: supplierAId,
        status: "draft",
        lines: [{ ingredientId: lowIngId, orderedQty: 300 }],
      }),
    });
    const created = await create.json();
    expect(create.status).toBe(201);
    expect(created.order.status).toBe("draft");
    expect(created.order.lines[0].orderedQty).toBe(300);

    // Edit qty to 350
    const patch = await fetch(`${BASE}/api/purchasing/orders/${created.order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        lines: [{ ingredientId: lowIngId, orderedQty: 350 }],
      }),
    });
    const patched = await patch.json();
    expect(patch.status).toBe(200);
    expect(patched.order.lines[0].orderedQty).toBe(350);

    // Order confirm
    const orderRes = await fetch(`${BASE}/api/purchasing/orders/${created.order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({ status: "ordered" }),
    });
    expect(orderRes.status).toBe(200);

    // Short-receive: 320 of 350
    const receive = await fetch(
      `${BASE}/api/purchasing/orders/${created.order.id}/receive`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: auth.cookie },
        body: JSON.stringify({
          lines: [{ ingredientId: lowIngId, receivedQty: 320 }],
        }),
      }
    );
    const recvData = await receive.json();
    expect(receive.status).toBe(200);
    expect(recvData.order.status).toBe("received");
    expect(recvData.order.lines[0].receivedQty).toBe(320);

    const afterAgg = await prisma.stockLedger.aggregate({
      where: { ingredientId: lowIngId },
      _sum: { qtyDelta: true },
    });
    const onHandAfter = Number(afterAgg._sum.qtyDelta ?? 0);
    expect(onHandAfter).toBe(onHandBefore + 320);

    const ledgerHit = await prisma.stockLedger.findFirst({
      where: {
        ingredientId: lowIngId,
        reason: { startsWith: `purchase_receive:${created.order.id}` },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(ledgerHit).toBeTruthy();
    expect(Number(ledgerHit!.qtyDelta)).toBe(320);

    const audits = await prisma.purchaseOrderAudit.findMany({
      where: { orderId: created.order.id },
    });
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("create");
    expect(actions).toContain("update");
    expect(actions).toContain("order");
    expect(actions).toContain("receive");
  });

  it("fromSuggestions creates draft with suggested lines", async () => {
    const auth = await login("owner@shinso.demo");
    // Ensure edamame still appears in suggestions
    const create = await fetch(`${BASE}/api/purchasing/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        fromSuggestions: true,
        supplierId: supplierAId,
        status: "draft",
        lines: [],
      }),
    });
    const created = await create.json();
    expect(create.status).toBe(201);
    expect(created.order.lines.length).toBeGreaterThanOrEqual(1);
    const eda = created.order.lines.find(
      (l: { ingredient?: { name: string } }) => l.ingredient?.name === "枝豆（冷凍）"
    );
    expect(eda).toBeTruthy();
    expect(eda.orderedQty).toBe(500);
    // Leave as draft — do not receive (preserve seed edamame for inventory tests)
  });

  it("cancel blocks receive", async () => {
    const auth = await login("manager@shinso.demo");
    const create = await fetch(`${BASE}/api/purchasing/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        supplierId: supplierAId,
        status: "draft",
        lines: [{ ingredientId: chickenAId, orderedQty: 100 }],
      }),
    });
    const created = await create.json();
    expect(create.status).toBe(201);

    const cancel = await fetch(`${BASE}/api/purchasing/orders/${created.order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({ status: "canceled" }),
    });
    expect(cancel.status).toBe(200);

    const receive = await fetch(
      `${BASE}/api/purchasing/orders/${created.order.id}/receive`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: auth.cookie },
        body: JSON.stringify({
          lines: [{ ingredientId: chickenAId, receivedQty: 100 }],
        }),
      }
    );
    expect(receive.status).toBe(409);
  });

  it("store isolation: Store B does not see Store A suggestions/orders", async () => {
    const auth = await login("brandadmin@shinso.demo");
    const switchB = await fetch(`${BASE}/api/session/switch-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({ storeId: storeBId }),
    });
    expect(switchB.status).toBe(200);
    const cookieB =
      (switchB.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ") ||
      auth.cookie;

    const sug = await fetch(`${BASE}/api/purchasing/suggestions`, {
      headers: { cookie: cookieB },
    });
    const sugData = await sug.json();
    expect(sug.status).toBe(200);
    expect(
      sugData.suggestions.every(
        (s: { name: string }) => s.name !== "枝豆（冷凍）" && s.name !== lowName
      )
    ).toBe(true);

    const orders = await fetch(`${BASE}/api/purchasing/orders`, {
      headers: { cookie: cookieB },
    });
    const ordData = await orders.json();
    expect(orders.status).toBe(200);
    for (const o of ordData.orders) {
      expect(
        o.lines.every(
          (l: { ingredient?: { name: string } }) =>
            l.ingredient?.name !== "枝豆（冷凍）" && l.ingredient?.name !== lowName
        )
      ).toBe(true);
    }
  });

  it("over-receive is allowed and recorded", async () => {
    const auth = await login("owner@shinso.demo");
    const create = await fetch(`${BASE}/api/purchasing/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({
        supplierId: supplierAId,
        status: "ordered",
        lines: [{ ingredientId: chickenAId, orderedQty: 50 }],
      }),
    });
    const created = await create.json();
    expect(create.status).toBe(201);

    const before = Number(
      (
        await prisma.stockLedger.aggregate({
          where: { ingredientId: chickenAId },
          _sum: { qtyDelta: true },
        })
      )._sum.qtyDelta ?? 0
    );

    const receive = await fetch(
      `${BASE}/api/purchasing/orders/${created.order.id}/receive`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: auth.cookie },
        body: JSON.stringify({
          lines: [{ ingredientId: chickenAId, receivedQty: 80 }],
        }),
      }
    );
    const data = await receive.json();
    expect(receive.status).toBe(200);
    expect(data.order.lines[0].receivedQty).toBe(80);

    const after = Number(
      (
        await prisma.stockLedger.aggregate({
          where: { ingredientId: chickenAId },
          _sum: { qtyDelta: true },
        })
      )._sum.qtyDelta ?? 0
    );
    expect(after).toBe(before + 80);
  });
});
