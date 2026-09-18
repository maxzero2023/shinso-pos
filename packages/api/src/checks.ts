import { z } from "zod";

export const addItemSchema = z.object({
  menuItemId: z.string().min(1),
  qty: z.number().int().min(1).max(99).default(1),
  modifierIds: z.array(z.string()).default([]),
  seat: z.number().int().min(1).optional(),
  note: z.string().max(200).optional(),
});

/** @deprecated import paySchema from payments — kept for backward compat */
export { paySchema } from "./payments/types";

export const kitchenStatusSchema = z.object({
  status: z.enum(["queued", "preparing", "ready", "served"]),
});

export const splitSchema = z.object({
  strategy: z.enum(["by_seat", "by_amount"]),
  seats: z.array(z.number().int()).optional(),
  amountYen: z.number().int().positive().optional(),
});
