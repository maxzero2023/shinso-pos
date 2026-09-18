import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";
import { tokyoTodayYmd, parseTokyoDayBounds } from "@shinso/api";

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

describe("AUT-46 reservation + waitlist", () => {
  let cookie = "";

  beforeAll(async () => {
    const store = await prisma.store.findFirst();
    expect(store).toBeTruthy();
    cookie = await login("floor@shinso.demo");
    expect(cookie).toContain("shinso_session");
  });

  it("lists seeded tonight reservations (Asia/Tokyo)", async () => {
    const date = tokyoTodayYmd();
    const res = await fetch(`${BASE}/api/reservations?date=${date}`, {
      headers: { cookie },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.timezone).toBe("Asia/Tokyo");
    expect(data.reservations.length).toBeGreaterThanOrEqual(1);
    const { start, end } = parseTokyoDayBounds(date);
    for (const r of data.reservations) {
      const t = new Date(r.startAt).getTime();
      expect(t).toBeGreaterThanOrEqual(start.getTime());
      expect(t).toBeLessThanOrEqual(end.getTime());
    }
  });

  it("create / update / cancel reservation", async () => {
    const date = tokyoTodayYmd();
    const startAt = new Date(`${date}T17:00:00+09:00`).toISOString();
    const createRes = await fetch(`${BASE}/api/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        partySize: 3,
        startAt,
        guestName: "テスト予約",
        status: "hold",
      }),
    });
    const created = await createRes.json();
    expect(createRes.status).toBe(201);
    expect(created.reservation.status).toBe("hold");
    const id = created.reservation.id as string;

    const patchRes = await fetch(`${BASE}/api/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ status: "confirmed", partySize: 4 }),
    });
    const patched = await patchRes.json();
    expect(patchRes.status).toBe(200);
    expect(patched.reservation.status).toBe("confirmed");
    expect(patched.reservation.partySize).toBe(4);

    const cancelRes = await fetch(`${BASE}/api/reservations/${id}/cancel`, {
      method: "POST",
      headers: { cookie },
    });
    const cancelled = await cancelRes.json();
    expect(cancelRes.status).toBe(200);
    expect(cancelled.reservation.status).toBe("cancelled");

    const seatRes = await fetch(`${BASE}/api/reservations/${id}/seat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({}),
    });
    expect(seatRes.status).toBe(409);
  });

  it("seat reservation opens Check; hold ≠ open Check beforehand", async () => {
    const tablesRes = await fetch(`${BASE}/api/tables`, { headers: { cookie } });
    const tablesData = await tablesRes.json();
    const free = tablesData.tables.find((t: { status: string }) => t.status === "free");
    expect(free).toBeTruthy();
    expect(free.openCheck).toBeNull();

    const date = tokyoTodayYmd();
    const startAt = new Date(`${date}T17:15:00+09:00`).toISOString();
    const createRes = await fetch(`${BASE}/api/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        partySize: 2,
        startAt,
        tableId: free.id,
        guestName: "着席テスト",
        status: "confirmed",
      }),
    });
    const created = await createRes.json();
    expect(createRes.status).toBe(201);
    const id = created.reservation.id as string;

    const tablesMid = await fetch(`${BASE}/api/tables`, { headers: { cookie } }).then((r) => r.json());
    const mid = tablesMid.tables.find((t: { id: string }) => t.id === free.id);
    expect(mid.openCheck).toBeNull();
    expect(mid.status).toBe("free");

    const seatRes = await fetch(`${BASE}/api/reservations/${id}/seat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({}),
    });
    const seated = await seatRes.json();
    expect(seatRes.status).toBe(201);
    expect(seated.check.status).toBe("open");
    expect(seated.reservation.status).toBe("seated");
    expect(seated.reservation.checkId).toBe(seated.check.id);

    const again = await fetch(`${BASE}/api/reservations/${id}/seat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({}),
    });
    expect(again.status).toBe(409);

    const openAgain = await fetch(`${BASE}/api/tables/${free.id}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ guestCount: 1 }),
    });
    expect(openAgain.status).toBe(409);

    await prisma.check.update({
      where: { id: seated.check.id },
      data: { status: "paid", closedAt: new Date() },
    });
    await prisma.table.update({
      where: { id: free.id },
      data: { status: "free" },
    });
  });

  it("waitlist join → call → seat", async () => {
    const joinRes = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ partySize: 2, guestName: "候位テスト" }),
    });
    const joined = await joinRes.json();
    expect(joinRes.status).toBe(201);
    expect(joined.ticket.status).toBe("waiting");
    const id = joined.ticket.id as string;

    const callRes = await fetch(`${BASE}/api/waitlist/${id}/call`, {
      method: "POST",
      headers: { cookie },
    });
    const called = await callRes.json();
    expect(callRes.status).toBe(200);
    expect(called.ticket.status).toBe("called");

    const tablesRes = await fetch(`${BASE}/api/tables`, { headers: { cookie } });
    const tablesData = await tablesRes.json();
    const free = tablesData.tables.find((t: { status: string }) => t.status === "free");
    expect(free).toBeTruthy();

    const seatRes = await fetch(`${BASE}/api/waitlist/${id}/seat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ tableId: free.id }),
    });
    const seated = await seatRes.json();
    expect(seatRes.status).toBe(201);
    expect(seated.ticket.status).toBe("seated");
    expect(seated.check.status).toBe("open");

    await prisma.check.update({
      where: { id: seated.check.id },
      data: { status: "paid", closedAt: new Date() },
    });
    await prisma.table.update({
      where: { id: free.id },
      data: { status: "free" },
    });
  });

  it("LINE notify stub endpoint", async () => {
    const res = await fetch(`${BASE}/api/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        channel: "line",
        event: "reservation.reminder",
        to: "U_demo",
        message: "ご予約の1時間前です",
      }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.notify.stub).toBe(true);
    expect(data.notify.event).toBe("reservation.reminder");
  });
});
