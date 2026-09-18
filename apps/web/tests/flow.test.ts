import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";
import { signQrToken, verifyQrToken, sumCheckItems } from "@shinso/api";
import { createHmac } from "crypto";

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const QR_SECRET = process.env.QR_HMAC_SECRET ?? "shinso-dev-qr-hmac-secret-change-in-prod!";

async function login(email: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie =
    setCookie.map((c) => c.split(";")[0]).join("; ") ||
    (res.headers.get("set-cookie") ?? "").split(",").map((c) => c.split(";")[0].trim()).join("; ");
  const data = await res.json();
  expect(res.status).toBe(200);
  return { cookie, staff: data.staff };
}

describe("FOH flow integration", () => {
  let cookie = "";
  let storeId = "";

  beforeAll(async () => {
    const store = await prisma.store.findFirst();
    expect(store).toBeTruthy();
    storeId = store!.id;
    const auth = await login("floor@shinso.demo");
    cookie = auth.cookie;
    expect(cookie).toContain("shinso_session");
  });

  it("open → order → fire → pay → table free", async () => {
    // pick a free table
    const tablesRes = await fetch(`${BASE}/api/tables`, { headers: { cookie } });
    const tablesData = await tablesRes.json();
    const free = tablesData.tables.find((t: { status: string }) => t.status === "free");
    expect(free).toBeTruthy();

    const openRes = await fetch(`${BASE}/api/tables/${free.id}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ guestCount: 2 }),
    });
    const openData = await openRes.json();
    expect(openRes.status).toBe(201);
    const checkId = openData.check.id as string;

    const menuRes = await fetch(`${BASE}/api/menu/categories`, { headers: { cookie } });
    const menuData = await menuRes.json();
    const item = menuData.categories[0].items[0];

    const addRes = await fetch(`${BASE}/api/checks/${checkId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ menuItemId: item.id, qty: 2, modifierIds: [] }),
    });
    expect(addRes.status).toBe(201);

    const fireRes = await fetch(`${BASE}/api/checks/${checkId}/fire`, {
      method: "POST",
      headers: { cookie },
    });
    expect(fireRes.status).toBe(201);

    const checkRes = await fetch(`${BASE}/api/checks/${checkId}`, { headers: { cookie } });
    const checkData = await checkRes.json();
    const total = checkData.check.totalYen as number;

    const payRes = await fetch(`${BASE}/api/checks/${checkId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ method: "paypay", amountYen: total }),
    });
    expect(payRes.status).toBe(200);

    const tables2 = await fetch(`${BASE}/api/tables`, { headers: { cookie } }).then((r) =>
      r.json()
    );
    const closed = tables2.tables.find((t: { id: string }) => t.id === free.id);
    expect(closed.status).toBe("free");

    // ordering after close should fail
    const again = await fetch(`${BASE}/api/checks/${checkId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ menuItemId: item.id, qty: 1, modifierIds: [] }),
    });
    expect([400, 409]).toContain(again.status);
  });

  it("QR appends to same open check", async () => {
    const tablesRes = await fetch(`${BASE}/api/tables`, { headers: { cookie } });
    const tablesData = await tablesRes.json();
    const free = tablesData.tables.find((t: { status: string }) => t.status === "free");
    expect(free).toBeTruthy();

    const openRes = await fetch(`${BASE}/api/tables/${free.id}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ guestCount: 1 }),
    });
    const openData = await openRes.json();
    const checkId = openData.check.id as string;

    const tokenRes = await fetch(`${BASE}/api/tables/${free.id}/qr-token`, {
      headers: { cookie },
    });
    const tokenData = await tokenRes.json();
    expect(tokenRes.status).toBe(200);
    const token = tokenData.token as string;

    const menuRes = await fetch(`${BASE}/api/qr/${token}/menu`);
    const menuData = await menuRes.json();
    expect(menuRes.status).toBe(200);
    const item = menuData.categories.flatMap((c: { items: Array<{ id: string }> }) => c.items)[0];

    const addRes = await fetch(`${BASE}/api/qr/${token}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menuItemId: item.id, qty: 1, modifierIds: [] }),
    });
    const addData = await addRes.json();
    expect(addRes.status).toBe(201);
    expect(addData.checkId).toBe(checkId);

    // cleanup pay
    const checkRes = await fetch(`${BASE}/api/checks/${checkId}`, { headers: { cookie } });
    const checkData = await checkRes.json();
    await fetch(`${BASE}/api/checks/${checkId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ method: "cash", amountYen: checkData.check.totalYen }),
    });
  });

  it("QR token HMAC verifies", () => {
    const token = signQrToken(
      { tableId: "t1", storeId: "s1", exp: Date.now() + 60_000 },
      QR_SECRET
    );
    const payload = verifyQrToken(token, QR_SECRET);
    expect(payload?.tableId).toBe("t1");
    expect(verifyQrToken(token + "x", QR_SECRET)).toBeNull();
    // silence unused
    expect(createHmac).toBeTruthy();
    expect(sumCheckItems([{ unitPriceYen: 100, qty: 2, status: "draft" }])).toBe(200);
    expect(storeId).toBeTruthy();
  });
});
