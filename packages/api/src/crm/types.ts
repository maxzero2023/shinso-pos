import { z } from "zod";

export const lineModeSchema = z.enum(["simulator", "live"]);
export type LineMode = z.infer<typeof lineModeSchema>;

/** ¥100 = 1 point (floor). Paid Check only. */
export const POINTS_YEN_PER_POINT = 100;

export const lineBindSchema = z.object({
  /** Required in live; optional in simulator (auto-generates sim_* id). */
  lineUserId: z.string().min(1).max(128).optional(),
  displayName: z.string().min(1).max(80).optional().nullable(),
  storeId: z.string().min(1).optional(),
});
export type LineBindInput = z.infer<typeof lineBindSchema>;

export const couponTemplateCreateSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().nullable(),
  discountYen: z.number().int().min(0).max(100_000).default(0),
  pointsCost: z.number().int().min(0).max(1_000_000).default(0),
  active: z.boolean().optional().default(true),
});
export type CouponTemplateCreateInput = z.infer<typeof couponTemplateCreateSchema>;

export const couponTemplateUpdateSchema = couponTemplateCreateSchema.partial();
export type CouponTemplateUpdateInput = z.infer<typeof couponTemplateUpdateSchema>;

export const couponIssueSchema = z.object({
  templateId: z.string().min(1),
  memberId: z.string().min(1),
});
export type CouponIssueInput = z.infer<typeof couponIssueSchema>;

export const couponRedeemSchema = z.object({
  code: z.string().min(4).max(40),
  checkId: z.string().min(1).optional().nullable(),
});
export type CouponRedeemInput = z.infer<typeof couponRedeemSchema>;

export const attachMemberSchema = z.object({
  memberId: z.string().min(1).optional(),
  lineUserId: z.string().min(1).max(128).optional(),
});
export type AttachMemberInput = z.infer<typeof attachMemberSchema>;
