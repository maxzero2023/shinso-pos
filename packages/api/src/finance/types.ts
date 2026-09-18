import { z } from "zod";
import { reportDateSchema } from "../reports";

/** Management-analysis estimate — not statutory accounting. */
export const FINANCE_DISCLAIMER_JA =
  "経営分析用の概算です。法定帳務・税務申告の代替ではありません。";

export const expenseCreateSchema = z.object({
  date: reportDateSchema,
  amountYen: z.number().int().positive().max(100_000_000),
  category: z.string().min(1).max(80),
  label: z.string().max(120).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});
export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;

export const expenseListQuerySchema = z.object({
  date: reportDateSchema.optional(),
  from: reportDateSchema.optional(),
  to: reportDateSchema.optional(),
});
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;

export const marginsQuerySchema = z.object({
  date: reportDateSchema,
});
export type MarginsQuery = z.infer<typeof marginsQuerySchema>;
