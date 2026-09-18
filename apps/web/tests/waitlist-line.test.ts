import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";
import {
  waitlistLineMessage,
  WAITLIST_ALMOST_CALL_POSITION,
  WAITLIST_STATUS_JA,
} from "@shinso/api";
import { resolveWaitlistLineTarget as resolveTarget } from "../lib/waitlist-notify";

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

describe("AUT-42 waitlist LINE unit", () => {
  it("Japanese templates + status labels", () => {
    expect(waitlistLineMessage("waitlist.called", { ticketNo: 7 })).toContain("7");
    expect(waitlistLineMessage("waitlist.almost_called", { ticketNo: 3, position: 2 })).toContain("まもなく");
    expect(WAITLIST_STATUS_JA.skipped).toBe("過号");
    expect(WAITLIST_ALMOST_CALL_POSITION).toBe(2);
  });

  it("resolveLineTarget: bound vs unbound", () => {
    expect(
      resolveTarget({
        id: "1",
        storeId: "s",
        ticketNo: 1,
        partySize: 2,
        guestLineId: null,
        memberId: null,
      }).source
    ).toBe("none");
    expect(
      resolveTarget({
        id: "1",
        storeId: "s",
        ticketNo: 1,
        partySize: 2,
        guestLineId: "sim_x",
        memberId: null,
      }).lineUserId
    ).toBe("sim_x");
    expect(
      resolveTarget({
        id: "1",
        storeId: "s",
        ticketNo: 1,
        partySize: 2,
        guestLineId: null,
        memberId: "m1",
        member: { id: "m1", lineUserId: "sim_demo_taro", displayName: "太郎" },
      }).source
    ).toBe("member");
  });
});

describe("AUT-42 waitlist LINE productionization", () => {
  let cookie = "";
  let storeId = "";

  beforeAll(async () => {
    cookie = await login("floor@shinso.demo");
    const store = await prisma.store.findFirst();
    expect(store).toBeTruthy();
    storeId = store!.id;
  });

  it("call pushes LINE when member-bound", async () => {
    const bound = await prisma.waitlistTicket.findFirst({
      where: {
        storeId,
        status: "waiting",
        OR: [{ guestLineId: { not: null } }, { memberId: { not: null } }],
      },
      include: { member: true },
      orderBy: { ticketNo: "asc" },
    });
    expect(bound).toBeTruthy();

    const res = await fetch(`${BASE}/api/waitlist/${bound!.id}/call`, {
      method: "POST",
      headers: { cookie },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ticket.status).toBe("called");
    expect(data.notify.pushed).toBe(true);
    expect(data.notify.to).toBeTruthy();
    expect(data.notify.to).toMatch(/^sim_/);

    // reset for later tests if needed — leave called; seat/skip tests use fresh tickets
  });

  it("call does not push when unbound", async () => {
    const unbound = await prisma.waitlistTicket.findFirst({
      where: {
        storeId,
        status: "waiting",
        guestLineId: null,
        memberId: null,
      },
      orderBy: { ticketNo: "asc" },
    });
    expect(unbound).toBeTruthy();

    const res = await fetch(`${BASE}/api/waitlist/${unbound!.id}/call`, {
      method: "POST",
      headers: { cookie },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ticket.status).toBe("called");
    expect(data.notify.pushed).toBe(false);
    expect(data.notify.reason).toBe("unbound");
    expect(data.notify.staffHint).toMatch(/未連携/);
  });

  it("skip → recall restores called + audit", async () => {
    const joinRes = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ partySize: 2, guestName: "スキップテスト" }),
    });
    const joined = await joinRes.json();
    expect(joinRes.status).toBe(201);
    const id = joined.ticket.id as string;

    const skipRes = await fetch(`${BASE}/api/waitlist/${id}/skip`, {
      method: "POST",
      headers: { cookie },
    });
    const skipped = await skipRes.json();
    expect(skipRes.status).toBe(200);
    expect(skipped.ticket.status).toBe("skipped");

    const recallRes = await fetch(`${BASE}/api/waitlist/${id}/recall`, {
      method: "POST",
      headers: { cookie },
    });
    const recalled = await recallRes.json();
    expect(recallRes.status).toBe(200);
    expect(recalled.ticket.status).toBe("called");
    expect(recalled.notify.pushed).toBe(false); // unbound

    const audits = await prisma.waitlistAuditLog.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: "asc" },
    });
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("join");
    expect(actions).toContain("skip");
    expect(actions).toContain("recall");
  });

  it("seat opens Check (existing seat API path)", async () => {
    const joinRes = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        partySize: 2,
        guestName: "着席LINEテスト",
        guestLineId: "sim_demo_hanako",
      }),
    });
    const joined = await joinRes.json();
    expect(joinRes.status).toBe(201);
    expect(joined.ticket.lineBound).toBe(true);
    const id = joined.ticket.id as string;

    await fetch(`${BASE}/api/waitlist/${id}/call`, {
      method: "POST",
      headers: { cookie },
    });

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
    expect(seated.notify.pushed).toBe(true);

    await prisma.check.update({
      where: { id: seated.check.id },
      data: { status: "paid", closedAt: new Date() },
    });
    await prisma.table.update({
      where: { id: free.id },
      data: { status: "free" },
    });
  });

  it("guest status page API returns Japanese fields", async () => {
    const waiting = await prisma.waitlistTicket.findFirst({
      where: { storeId, status: "waiting" },
    });
    expect(waiting).toBeTruthy();
    const res = await fetch(`${BASE}/api/waitlist/${waiting!.id}/status`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ticket.ticketNo).toBe(waiting!.ticketNo);
    expect(data.ticket.statusJa).toBeTruthy();
    expect(data.ticket.position).toBeGreaterThanOrEqual(1);
  });

  it("business-day ticket numbers are unique per store", async () => {
    const a = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ partySize: 1, guestName: "番号A" }),
    }).then((r) => r.json());
    const b = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ partySize: 1, guestName: "番号B" }),
    }).then((r) => r.json());
    expect(b.ticket.ticketNo).toBe(a.ticket.ticketNo + 1);
  });
});
