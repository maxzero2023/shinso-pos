import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";
import { signPayPayWebhook } from "@shinso/api";

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
  expect(res.status).toBe(200);
  return cookie;
}

async function openCheckWithItem(cookie: string) {
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
  expect(openRes.status).toBe(201);
  const checkId = openData.check.id as string;

  const menuRes = await fetch(`${BASE}/api/menu/categories`, { headers: { cookie } });
  const menuData = await menuRes.json();
  const item = menuData.categories[0].items[0];

  const addRes = await fetch(`${BASE}/api/checks/${checkId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ menuItemId: item.id, qty: 1, modifierIds: [] }),
  });
  expect(addRes.status).toBe(201);

  const checkRes = await fetch(`${BASE}/api/checks/${checkId}`, { headers: { cookie } });
  const checkData = await checkRes.json();
  return {
    tableId: free.id as string,
    checkId,
    total: checkData.check.totalYen as number,
  };
}

describe("AUT-29 payments", () => {
  let cookie = "";

  beforeAll(async () => {
    cookie = await login("floor@shinso.demo");
  });

  it("GET /api/payments/config returns mode", async () => {
    const res = await fetch(`${BASE}/api/payments/config`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(["mock", "sandbox", "live"]).toContain(data.mode);
  });

  it("mock pay still closes check (cash)", async () => {
    const { checkId, total, tableId } = await openCheckWithItem(cookie);
    const payRes = await fetch(`${BASE}/api/checks/${checkId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ method: "cash", amountYen: total }),
    });
    expect(payRes.status).toBe(200);
    const payData = await payRes.json();
    expect(payData.payment.status).toBe("succeeded");
    expect(payData.check.status).toBe("paid");

    const tables2 = await fetch(`${BASE}/api/tables`, { headers: { cookie } }).then((r) =>
      r.json()
    );
    expect(tables2.tables.find((t: { id: string }) => t.id === tableId).status).toBe("free");
  });

  it("idempotencyKey replays same payment", async () => {
    const { checkId, total } = await openCheckWithItem(cookie);
    const key = `test_idem_${Date.now()}`;
    const body = { method: "paypay", amountYen: total, idempotencyKey: key };
    const r1 = await fetch(`${BASE}/api/checks/${checkId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(body),
    });
    const d1 = await r1.json();
    expect(r1.status).toBe(200);

    const r2 = await fetch(`${BASE}/api/checks/${checkId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(body),
    });
    const d2 = await r2.json();
    expect(r2.status).toBe(200);
    expect(d2.payment.id).toBe(d1.payment.id);
  });

  it("PayPay simulate failed does NOT close check", async () => {
    const { checkId, total } = await openCheckWithItem(cookie);

    const payment = await prisma.payment.create({
      data: {
        checkId,
        method: "paypay",
        amountYen: total,
        mock: true,
        status: "pending",
        provider: "paypay",
        providerPaymentId: `pp_test_fail_${Date.now()}`,
        idempotencyKey: `fail_${Date.now()}`,
        paidAt: null,
      },
    });

    const sim = await fetch(`${BASE}/api/payments/paypay/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ paymentId: payment.id, outcome: "failed" }),
    });
    const simData = await sim.json();
    expect(sim.status).toBe(200);
    expect(simData.payment.status).toBe("failed");
    expect(simData.check.status).toBe("open");
    expect(simData.checkStillOpen).toBe(true);

    await fetch(`${BASE}/api/checks/${checkId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        method: "cash",
        amountYen: total,
        idempotencyKey: `cleanup_${Date.now()}`,
      }),
    });
  });

  it("PayPay webhook signature + succeed settles check", async () => {
    const { checkId, total, tableId } = await openCheckWithItem(cookie);
    const merchantPaymentId = `pp_wh_${Date.now()}`;
    const payment = await prisma.payment.create({
      data: {
        checkId,
        method: "paypay",
        amountYen: total,
        mock: true,
        status: "pending",
        provider: "paypay",
        providerPaymentId: merchantPaymentId,
        idempotencyKey: `wh_${Date.now()}`,
        paidAt: null,
      },
    });

    const notificationId = `notif_${Date.now()}`;
    const payload = JSON.stringify({
      notificationId,
      merchantPaymentId,
      state: "COMPLETED",
      amount: { amount: total, currency: "JPY" },
    });
    const timestamp = String(Date.now());
    const secret = process.env.PAYPAY_WEBHOOK_SECRET || "paypay-sandbox-simulator-secret";
    const signature = signPayPayWebhook(payload, secret, timestamp);

    const wh = await fetch(`${BASE}/api/webhooks/paypay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paypay-signature": signature,
        "x-paypay-auth-timestamp": timestamp,
      },
      body: payload,
    });
    expect(wh.status).toBe(200);

    const wh2 = await fetch(`${BASE}/api/webhooks/paypay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paypay-signature": signature,
        "x-paypay-auth-timestamp": timestamp,
      },
      body: payload,
    });
    const wh2Data = await wh2.json();
    expect(wh2Data.duplicate).toBe(true);

    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated?.status).toBe("succeeded");
    const check = await prisma.check.findUnique({ where: { id: checkId } });
    expect(check?.status).toBe("paid");
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    expect(table?.status).toBe("free");
  });

  it("Stripe simulator confirm settles; cancel does not", async () => {
    const { checkId, total } = await openCheckWithItem(cookie);
    const payment = await prisma.payment.create({
      data: {
        checkId,
        method: "card",
        amountYen: total,
        mock: true,
        status: "pending",
        provider: "stripe",
        providerPaymentId: `pi_sim_cancel_${Date.now()}`,
        clientSecret: `pi_sim_cancel_${Date.now()}_secret_sim`,
        idempotencyKey: `card_cancel_${Date.now()}`,
        paidAt: null,
      },
    });

    const cancel = await fetch(
      `${BASE}/api/checks/${checkId}/payments/${payment.id}/cancel`,
      { method: "POST", headers: { cookie } }
    );
    const cancelData = await cancel.json();
    expect(cancel.status).toBe(200);
    expect(cancelData.payment.status).toBe("canceled");
    expect(cancelData.check.status).toBe("open");

    const payment2 = await prisma.payment.create({
      data: {
        checkId,
        method: "card",
        amountYen: total,
        mock: true,
        status: "pending",
        provider: "stripe",
        providerPaymentId: `pi_sim_ok_${Date.now()}`,
        clientSecret: `pi_sim_ok_${Date.now()}_secret_sim`,
        idempotencyKey: `card_ok_${Date.now()}`,
        paidAt: null,
      },
    });
    const conf = await fetch(
      `${BASE}/api/checks/${checkId}/payments/${payment2.id}/confirm`,
      { method: "POST", headers: { cookie } }
    );
    const confData = await conf.json();
    expect(conf.status).toBe(200);
    expect(confData.payment.status).toBe("succeeded");
    expect(confData.check.status).toBe("paid");
  });
});
