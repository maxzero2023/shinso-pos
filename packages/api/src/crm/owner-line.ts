import { randomBytes } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  buildBestsellersReport,
  buildDailyReport,
  buildTableAvgReport,
  tokyoDayRange,
  tokyoYmd,
  type PaidCheckForReport,
} from "../reports";
import { getLineMode } from "./mode";
import { sendLineMessage, type LineMessageResult } from "./messaging";

export const ownerLineDigestKindSchema = z.enum(["daily", "weekly"]);
export type OwnerLineDigestKind = z.infer<typeof ownerLineDigestKindSchema>;

export const ownerLineBindSchema = z.object({
  lineUserId: z.string().min(1).max(128).optional(),
  storeId: z.string().min(1).optional(),
});
export type OwnerLineBindInput = z.infer<typeof ownerLineBindSchema>;

export const ownerLineSettingsSchema = z.object({
  dailyEnabled: z.boolean().optional(),
  weeklyEnabled: z.boolean().optional(),
});
export type OwnerLineSettingsInput = z.infer<typeof ownerLineSettingsSchema>;

export const ownerLineTriggerSchema = z.object({
  kind: ownerLineDigestKindSchema,
  /** Override as-of instant (ISO). Defaults to now. */
  asOf: z.string().datetime().optional(),
  /** Override target date YYYY-MM-DD (Tokyo). Daily uses this day; weekly uses week containing it. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type OwnerLineTriggerInput = z.infer<typeof ownerLineTriggerSchema>;

function simOwnerLineUserId(): string {
  return `sim_owner_${randomBytes(6).toString("hex")}`;
}

/** Yesterday YYYY-MM-DD in Asia/Tokyo relative to `asOf`. */
export function tokyoYesterdayYmd(asOf: Date = new Date()): string {
  const today = tokyoYmd(asOf);
  const { start } = tokyoDayRange(today);
  return tokyoYmd(new Date(start.getTime() - 1));
}

/** Add calendar days to a Tokyo YMD (can be negative). */
export function addTokyoDays(ymd: string, delta: number): string {
  const { start } = tokyoDayRange(ymd);
  return tokyoYmd(new Date(start.getTime() + delta * 24 * 60 * 60 * 1000));
}

/** Monday–Sunday (Tokyo) containing `ymd`. Monday = start of business week. */
export function tokyoWeekMonSun(ymd: string): { from: string; to: string } {
  const { start } = tokyoDayRange(ymd);
  // weekday in Tokyo: 0=Sun … 6=Sat via en-US
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(start);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const day = map[wd] ?? 1;
  const daysFromMon = day === 0 ? 6 : day - 1;
  const from = addTokyoDays(ymd, -daysFromMon);
  const to = addTokyoDays(from, 6);
  return { from, to };
}

export type OwnerDigestPeriod = {
  kind: OwnerLineDigestKind;
  from: string;
  to: string;
};

export function resolveDigestPeriod(
  kind: OwnerLineDigestKind,
  opts?: { asOf?: Date; date?: string }
): OwnerDigestPeriod {
  const anchor = opts?.date ?? tokyoYesterdayYmd(opts?.asOf ?? new Date());
  if (kind === "daily") {
    return { kind, from: anchor, to: anchor };
  }
  const week = tokyoWeekMonSun(anchor);
  return { kind, from: week.from, to: week.to };
}

function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

export type DigestSnapshot = {
  kind: OwnerLineDigestKind;
  timezone: "Asia/Tokyo";
  periodFrom: string;
  periodTo: string;
  revenueYen: number;
  paidCheckCount: number;
  tableAvgYen: number;
  bestsellers: Array<{ name: string; qty: number; revenueYen: number }>;
  voidExcluded: true;
};

export function buildDigestSnapshot(
  kind: OwnerLineDigestKind,
  from: string,
  to: string,
  checks: PaidCheckForReport[]
): DigestSnapshot {
  if (kind === "daily") {
    const daily = buildDailyReport(from, checks);
    const table = buildTableAvgReport(from, checks);
    const best = buildBestsellersReport(from, to, checks, 5);
    return {
      kind,
      timezone: "Asia/Tokyo",
      periodFrom: from,
      periodTo: to,
      revenueYen: daily.revenueYen,
      paidCheckCount: daily.paidCheckCount,
      tableAvgYen: table.tableAvgYen,
      bestsellers: best.items.map((i) => ({
        name: i.name,
        qty: i.qty,
        revenueYen: i.revenueYen,
      })),
      voidExcluded: true,
    };
  }

  // Weekly: sum daily buckets over Mon–Sun so口径 matches AUT-32 daily
  let revenueYen = 0;
  let paidCheckCount = 0;
  let d = from;
  while (true) {
    const day = buildDailyReport(d, checks);
    revenueYen += day.revenueYen;
    paidCheckCount += day.paidCheckCount;
    if (d === to) break;
    d = addTokyoDays(d, 1);
  }
  const tableAvgYen =
    paidCheckCount === 0 ? 0 : Math.round(revenueYen / paidCheckCount);
  const best = buildBestsellersReport(from, to, checks, 5);
  return {
    kind,
    timezone: "Asia/Tokyo",
    periodFrom: from,
    periodTo: to,
    revenueYen,
    paidCheckCount,
    tableAvgYen,
    bestsellers: best.items.map((i) => ({
      name: i.name,
      qty: i.qty,
      revenueYen: i.revenueYen,
    })),
    voidExcluded: true,
  };
}

export function formatDigestMessage(snapshot: DigestSnapshot): string {
  const title =
    snapshot.kind === "daily"
      ? `【日報】${snapshot.periodFrom}`
      : `【週報】${snapshot.periodFrom}〜${snapshot.periodTo}`;
  const top =
    snapshot.bestsellers.length === 0
      ? "（なし）"
      : snapshot.bestsellers
          .slice(0, 3)
          .map((b) => `${b.name}×${b.qty}`)
          .join(" / ");
  return [
    title,
    `売上: ${yen(snapshot.revenueYen)}`,
    `精算件数: ${snapshot.paidCheckCount}`,
    `卓均: ${yen(snapshot.tableAvgYen)}`,
    `熱銷 TOP: ${top}`,
  ].join("\n");
}

export async function bindOwnerLine(
  db: PrismaClient,
  storeId: string,
  input: OwnerLineBindInput,
  env: NodeJS.ProcessEnv = process.env
) {
  const mode = getLineMode(env);
  let lineUserId = input.lineUserId?.trim();
  if (!lineUserId) {
    if (mode !== "simulator") {
      return {
        ok: false as const,
        status: 400,
        error: "live モードでは lineUserId が必須です",
      };
    }
    lineUserId = simOwnerLineUserId();
  }

  const existing = await db.ownerLineBinding.findUnique({ where: { storeId } });
  if (existing) {
    const updated = await db.ownerLineBinding.update({
      where: { id: existing.id },
      data: { lineUserId },
    });
    return {
      ok: true as const,
      status: 200,
      data: { binding: updated, mode, created: false, replayed: true },
    };
  }

  const binding = await db.ownerLineBinding.create({
    data: {
      storeId,
      lineUserId,
      dailyEnabled: true,
      weeklyEnabled: true,
    },
  });

  await sendLineMessage({
    to: lineUserId,
    event: "crm.owner_line.bind",
    message: "オーナーLINE日報/週報の绑定が完了しました",
    meta: { storeId, bindingId: binding.id, mode },
  });

  return {
    ok: true as const,
    status: 201,
    data: { binding, mode, created: true, replayed: false },
  };
}

export async function updateOwnerLineSettings(
  db: PrismaClient,
  storeId: string,
  input: OwnerLineSettingsInput
) {
  const existing = await db.ownerLineBinding.findUnique({ where: { storeId } });
  if (!existing) {
    return {
      ok: false as const,
      status: 404,
      error: "オーナーLINEが未绑定です",
    };
  }
  if (input.dailyEnabled === undefined && input.weeklyEnabled === undefined) {
    return {
      ok: false as const,
      status: 400,
      error: "dailyEnabled または weeklyEnabled を指定してください",
    };
  }
  const binding = await db.ownerLineBinding.update({
    where: { id: existing.id },
    data: {
      ...(input.dailyEnabled !== undefined
        ? { dailyEnabled: input.dailyEnabled }
        : {}),
      ...(input.weeklyEnabled !== undefined
        ? { weeklyEnabled: input.weeklyEnabled }
        : {}),
    },
  });
  return { ok: true as const, status: 200, data: { binding } };
}

export type SendLineFn = (
  payload: Parameters<typeof sendLineMessage>[0]
) => Promise<LineMessageResult>;

export type LoadChecksFn = (
  storeId: string,
  fromYmd: string,
  toYmd: string
) => Promise<PaidCheckForReport[]>;

export type DigestRunResult = {
  status: "sent" | "failed" | "skipped";
  reason?: string;
  logId?: string;
  snapshot?: DigestSnapshot;
  messageText?: string;
  attemptCount: number;
  period: OwnerDigestPeriod;
};

/**
 * Run daily/weekly owner LINE digest for one store.
 * Unbound / disabled → skipped (logged). Failure → 1 retry then failed log.
 */

async function defaultLoadPaidChecks(
  db: PrismaClient,
  storeId: string,
  fromYmd: string,
  toYmd: string
): Promise<PaidCheckForReport[]> {
  const { start } = tokyoDayRange(fromYmd);
  const { end } = tokyoDayRange(toYmd);
  const padMs = 24 * 60 * 60 * 1000;
  const checks = await db.check.findMany({
    where: {
      status: "paid",
      table: { area: { storeId } },
      OR: [
        {
          closedAt: {
            gte: new Date(start.getTime() - padMs),
            lt: new Date(end.getTime() + padMs),
          },
        },
        {
          payments: {
            some: {
              status: "succeeded",
              paidAt: {
                gte: new Date(start.getTime() - padMs),
                lt: new Date(end.getTime() + padMs),
              },
            },
          },
        },
      ],
    },
    include: {
      items: true,
      payments: {
        where: { status: "succeeded" },
        select: { status: true, paidAt: true, amountYen: true },
      },
    },
  });
  return checks as PaidCheckForReport[];
}

export async function runOwnerLineDigest(
  db: PrismaClient,
  storeId: string,
  kind: OwnerLineDigestKind,
  opts?: {
    asOf?: Date;
    date?: string;
    sendFn?: SendLineFn;
    loadChecks?: LoadChecksFn;
  }
): Promise<DigestRunResult> {
  const period = resolveDigestPeriod(kind, {
    asOf: opts?.asOf,
    date: opts?.date,
  });
  const sendFn = opts?.sendFn ?? sendLineMessage;

  const binding = await db.ownerLineBinding.findUnique({ where: { storeId } });
  if (!binding) {
    const log = await db.ownerLineDeliveryLog.create({
      data: {
        storeId,
        kind,
        status: "skipped",
        periodFrom: period.from,
        periodTo: period.to,
        messageText: "",
        snapshot: { reason: "unbound" },
        errorMessage: "unbound",
        attemptCount: 0,
      },
    });
    return {
      status: "skipped",
      reason: "unbound",
      logId: log.id,
      attemptCount: 0,
      period,
    };
  }

  const enabled = kind === "daily" ? binding.dailyEnabled : binding.weeklyEnabled;
  if (!enabled) {
    const log = await db.ownerLineDeliveryLog.create({
      data: {
        storeId,
        bindingId: binding.id,
        kind,
        status: "skipped",
        periodFrom: period.from,
        periodTo: period.to,
        messageText: "",
        snapshot: { reason: "disabled", kind },
        errorMessage: "disabled",
        attemptCount: 0,
      },
    });
    return {
      status: "skipped",
      reason: "disabled",
      logId: log.id,
      attemptCount: 0,
      period,
    };
  }

  let checks: PaidCheckForReport[];
  if (opts?.loadChecks) {
    checks = await opts.loadChecks(storeId, period.from, period.to);
  } else {
    checks = await defaultLoadPaidChecks(db, storeId, period.from, period.to);
  }

  const snapshot = buildDigestSnapshot(kind, period.from, period.to, checks);
  const messageText = formatDigestMessage(snapshot);
  const event =
    kind === "daily" ? "crm.owner_line.digest.daily" : "crm.owner_line.digest.weekly";

  let attemptCount = 0;
  let lastError: string | null = null;
  let sent: LineMessageResult | null = null;

  for (let tryNo = 1; tryNo <= 2; tryNo++) {
    attemptCount = tryNo;
    try {
      const result = await sendFn({
        to: binding.lineUserId,
        event,
        message: messageText,
        meta: {
          storeId,
          bindingId: binding.id,
          kind,
          periodFrom: period.from,
          periodTo: period.to,
          snapshot,
        },
      });
      if (result.ok) {
        sent = result;
        lastError = null;
        break;
      }
      lastError = "send returned not ok";
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  if (sent) {
    const log = await db.ownerLineDeliveryLog.create({
      data: {
        storeId,
        bindingId: binding.id,
        kind,
        status: "sent",
        periodFrom: period.from,
        periodTo: period.to,
        messageText,
        snapshot,
        attemptCount,
        sentAt: new Date(),
      },
    });
    return {
      status: "sent",
      logId: log.id,
      snapshot,
      messageText,
      attemptCount,
      period,
    };
  }

  const log = await db.ownerLineDeliveryLog.create({
    data: {
      storeId,
      bindingId: binding.id,
      kind,
      status: "failed",
      periodFrom: period.from,
      periodTo: period.to,
      messageText,
      snapshot,
      errorMessage: lastError ?? "send failed",
      attemptCount,
    },
  });
  return {
    status: "failed",
    reason: lastError ?? "send failed",
    logId: log.id,
    snapshot,
    messageText,
    attemptCount,
    period,
  };
}
