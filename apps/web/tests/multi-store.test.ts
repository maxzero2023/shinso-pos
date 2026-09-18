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
  return { cookie, staff: data.staff as {
    id: string;
    role: string;
    storeId: string;
    activeStoreId: string;
    brandId: string | null;
  } };
}

describe("AUT-37 multi-store Brand/Store", () => {
  let brandId = "";
  let storeAId = "";
  let storeBId = "";

  beforeAll(async () => {
    const brand = await prisma.brand.findFirst({ where: { name: "SHINSO Demo" } });
    expect(brand).toBeTruthy();
    brandId = brand!.id;
    const stores = await prisma.store.findMany({
      where: { brandId },
      orderBy: { createdAt: "asc" },
    });
    expect(stores.length).toBeGreaterThanOrEqual(2);
    storeAId = stores.find((s) => s.name === "シンソウデモ店")?.id ?? stores[0].id;
    storeBId = stores.find((s) => s.name === "シンソウデモ店 B")?.id ?? stores[1].id;
    expect(storeAId).not.toBe(storeBId);
  });

  it("legacy demo login still works (floor + owner)", async () => {
    const floor = await login("floor@shinso.demo");
    expect(floor.staff.role).toBe("floor");
    expect(floor.staff.storeId).toBe(storeAId);
    expect(floor.staff.activeStoreId).toBe(storeAId);

    const owner = await login("owner@shinso.demo");
    expect(owner.staff.role).toBe("owner");
    expect(owner.staff.activeStoreId).toBe(storeAId);
  });

  it("brand_admin sees both stores; can switch", async () => {
    const auth = await login("brandadmin@shinso.demo");
    expect(auth.staff.role).toBe("brand_admin");
    expect(auth.staff.brandId).toBe(brandId);

    const listRes = await fetch(`${BASE}/api/session/stores`, {
      headers: { cookie: auth.cookie },
    });
    const listData = await listRes.json();
    expect(listRes.status).toBe(200);
    const ids = (listData.stores as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toContain(storeAId);
    expect(ids).toContain(storeBId);

    const switchRes = await fetch(`${BASE}/api/session/switch-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({ storeId: storeBId }),
    });
    expect(switchRes.status).toBe(200);
    const switchCookie =
      (switchRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ") ||
      auth.cookie;

    const menuRes = await fetch(`${BASE}/api/menu/categories`, {
      headers: { cookie: switchCookie },
    });
    const menuData = await menuRes.json();
    expect(menuRes.status).toBe(200);
    const names = (menuData.categories as Array<{ name: string }>).map((c) => c.name);
    expect(names.some((n) => n.includes("B店"))).toBe(true);
    expect(names.some((n) => n === "前菜")).toBe(false);

    const tablesRes = await fetch(`${BASE}/api/tables`, {
      headers: { cookie: switchCookie },
    });
    const tablesData = await tablesRes.json();
    const codes = (tablesData.tables as Array<{ code: string }>).map((t) => t.code);
    expect(codes).toContain("B1");
    expect(codes).not.toContain("T1");
  });

  it("manager cannot switch to other store (403)", async () => {
    const auth = await login("manager@shinso.demo");
    expect(auth.staff.role).toBe("manager");
    expect(auth.staff.activeStoreId).toBe(storeAId);

    const switchRes = await fetch(`${BASE}/api/session/switch-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({ storeId: storeBId }),
    });
    expect(switchRes.status).toBe(403);

    const listRes = await fetch(`${BASE}/api/session/stores`, {
      headers: { cookie: auth.cookie },
    });
    const listData = await listRes.json();
    expect(listData.stores).toHaveLength(1);
    expect(listData.stores[0].id).toBe(storeAId);
  });

  it("brand_admin can create a store under brand", async () => {
    const auth = await login("brandadmin@shinso.demo");
    const name = `テスト店 ${Date.now()}`;
    const res = await fetch(`${BASE}/api/stores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({ brandId, name, timezone: "Asia/Tokyo" }),
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.store.brandId).toBe(brandId);
    expect(data.store.name).toBe(name);

    // cleanup created store (no dependent rows)
    await prisma.store.delete({ where: { id: data.store.id } });
  });

  it("manager cannot create store", async () => {
    const auth = await login("manager@shinso.demo");
    const res = await fetch(`${BASE}/api/stores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({ brandId, name: "不正店舗", timezone: "Asia/Tokyo" }),
    });
    expect(res.status).toBe(403);
  });

  it("switch isolates checks listing scope via tables", async () => {
    const auth = await login("brandadmin@shinso.demo");
    // ensure on store A
    await fetch(`${BASE}/api/session/switch-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: auth.cookie },
      body: JSON.stringify({ storeId: storeAId }),
    });
    // re-login for fresh cookie after switch (cookie may update)
    const a = await login("brandadmin@shinso.demo");
    let cookie = a.cookie;

    const switchB = await fetch(`${BASE}/api/session/switch-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ storeId: storeBId }),
    });
    expect(switchB.status).toBe(200);
    cookie =
      (switchB.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ") || cookie;

    const tablesB = await fetch(`${BASE}/api/tables`, { headers: { cookie } });
    const dataB = await tablesB.json();
    expect(dataB.tables.every((t: { code: string }) => t.code.startsWith("B"))).toBe(true);

    const switchA = await fetch(`${BASE}/api/session/switch-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ storeId: storeAId }),
    });
    cookie =
      (switchA.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ") || cookie;

    const tablesA = await fetch(`${BASE}/api/tables`, { headers: { cookie } });
    const dataA = await tablesA.json();
    expect(dataA.tables.some((t: { code: string }) => t.code === "T1")).toBe(true);
    expect(dataA.tables.some((t: { code: string }) => t.code === "B1")).toBe(false);
  });
});
