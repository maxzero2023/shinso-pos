import { z } from "zod";

/** MVP units: simple string, no conversion. */
export const ingredientUnitSchema = z.enum(["g", "ml", "pc"]);
export type IngredientUnit = z.infer<typeof ingredientUnitSchema>;

export const ingredientCreateSchema = z.object({
  name: z.string().min(1).max(80),
  unit: ingredientUnitSchema,
  lowStockThreshold: z.number().min(0).max(1_000_000_000),
  costYenPerUnit: z.number().int().min(0).max(10_000_000).default(0),
  active: z.boolean().optional().default(true),
});
export type IngredientCreateInput = z.infer<typeof ingredientCreateSchema>;

export const ingredientUpdateSchema = ingredientCreateSchema.partial();
export type IngredientUpdateInput = z.infer<typeof ingredientUpdateSchema>;

export const stockLedgerCreateSchema = z.object({
  ingredientId: z.string().min(1),
  /** Positive inbound, negative outbound. Non-zero. */
  qtyDelta: z
    .number()
    .refine((n) => n !== 0, { message: "qtyDelta は 0 以外である必要があります" })
    .refine((n) => Math.abs(n) <= 1_000_000_000, { message: "qtyDelta が大きすぎます" }),
  reason: z.string().min(1).max(200),
});
export type StockLedgerCreateInput = z.infer<typeof stockLedgerCreateSchema>;

export const bomLineCreateSchema = z.object({
  menuItemId: z.string().min(1),
  ingredientId: z.string().min(1),
  qtyPerItem: z.number().positive().max(1_000_000_000),
});
export type BomLineCreateInput = z.infer<typeof bomLineCreateSchema>;

export const bomLineUpdateSchema = z.object({
  qtyPerItem: z.number().positive().max(1_000_000_000),
});
export type BomLineUpdateInput = z.infer<typeof bomLineUpdateSchema>;

export const usageEstimateQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type UsageEstimateQuery = z.infer<typeof usageEstimateQuerySchema>;
