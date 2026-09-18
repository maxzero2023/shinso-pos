import { z } from "zod";

/** Calendar YYYY-MM-DD in Asia/Tokyo. */
export function tokyoBusinessDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Midnight UTC for the Tokyo calendar date (for Prisma @db.Date). */
export function tokyoBusinessDate(now: Date = new Date()): Date {
  const s = tokyoBusinessDateString(now);
  return new Date(`${s}T00:00:00.000Z`);
}

export type OpsRole = "brand_admin" | "owner" | "manager" | "floor" | "kitchen";

/** brand_admin / owner / manager act as elevated for void/edit. */
export function isManagerRole(role: OpsRole): boolean {
  return role === "brand_admin" || role === "owner" || role === "manager";
}

/**
 * Floor may void draft only.
 * Owner/manager may void fired items, and items on paid checks (with audit).
 */
export function canVoidCheckItem(opts: {
  role: OpsRole;
  itemStatus: string;
  checkStatus: string;
}): { ok: true } | { ok: false; reason: string } {
  const { role, itemStatus, checkStatus } = opts;
  if (itemStatus === "void") {
    return { ok: false, reason: "すでに取消済みです" };
  }
  if (checkStatus === "void") {
    return { ok: false, reason: "取消済みの伝票です" };
  }
  if (itemStatus === "draft") {
    if (role === "kitchen") return { ok: false, reason: "権限がありません" };
    return { ok: true };
  }
  // fired or any other live status on open/paid
  if (isManagerRole(role)) return { ok: true };
  return {
    ok: false,
    reason: "送厨済・精算済の取消は店長/オーナー権限が必要です",
  };
}

/**
 * Floor may edit draft qty/note only.
 * Owner may edit fired items; paid check edits require owner.
 */
export function canEditCheckItem(opts: {
  role: OpsRole;
  itemStatus: string;
  checkStatus: string;
}): { ok: true } | { ok: false; reason: string } {
  const { role, itemStatus, checkStatus } = opts;
  if (itemStatus === "void") {
    return { ok: false, reason: "取消済みの明細は変更できません" };
  }
  if (checkStatus === "void") {
    return { ok: false, reason: "取消済みの伝票です" };
  }
  if (itemStatus === "draft" && checkStatus === "open") {
    if (role === "kitchen") return { ok: false, reason: "権限がありません" };
    return { ok: true };
  }
  if (isManagerRole(role)) return { ok: true };
  return {
    ok: false,
    reason: "送厨済・精算済の改単は店長/オーナー権限が必要です",
  };
}

export const voidItemSchema = z.object({
  checkItemId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const editItemSchema = z
  .object({
    checkItemId: z.string().min(1),
    qty: z.number().int().min(1).max(99).optional(),
    note: z.string().max(200).nullable().optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((d) => d.qty !== undefined || d.note !== undefined, {
    message: "qty または note が必要です",
  });

export const flagExceptionSchema = z.object({
  note: z.string().min(1).max(500),
});

export const resolveExceptionSchema = z.object({
  note: z.string().max(500).optional(),
});

export const openShiftSchema = z.object({
  note: z.string().max(200).optional(),
});

export const closeShiftSchema = z.object({
  note: z.string().max(200).optional(),
});

export type CheckAuditAction =
  | "void_item"
  | "edit_item"
  | "flag_exception"
  | "resolve_exception";
