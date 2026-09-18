import { z } from "zod";

export const purchaseOrderStatusSchema = z.enum([
  "draft",
  "ordered",
  "received",
  "canceled",
]);
export type PurchaseOrderStatus = z.infer<typeof purchaseOrderStatusSchema>;

export const purchaseOrderLineInputSchema = z.object({
  ingredientId: z.string().min(1),
  orderedQty: z.number().min(0).max(1_000_000_000),
});
export type PurchaseOrderLineInput = z.infer<typeof purchaseOrderLineInputSchema>;

export const purchaseOrderCreateSchema = z
  .object({
    supplierId: z.string().min(1).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    /** Create as draft (default) or jump to ordered. */
    status: z.enum(["draft", "ordered"]).optional().default("draft"),
    lines: z.array(purchaseOrderLineInputSchema).max(200).optional().default([]),
    /** When true, fill lines from low-stock suggestions. */
    fromSuggestions: z.boolean().optional().default(false),
  })
  .superRefine((val, ctx) => {
    if (!val.fromSuggestions && (!val.lines || val.lines.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "明細が必要です（または fromSuggestions: true）",
        path: ["lines"],
      });
    }
  });
export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;

export const purchaseOrderUpdateSchema = z.object({
  supplierId: z.string().min(1).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  /** Transition: draft→ordered, or cancel from draft|ordered. */
  status: z.enum(["draft", "ordered", "canceled"]).optional(),
  lines: z.array(purchaseOrderLineInputSchema).min(1).max(200).optional(),
});
export type PurchaseOrderUpdateInput = z.infer<typeof purchaseOrderUpdateSchema>;

export const purchaseOrderReceiveLineSchema = z.object({
  ingredientId: z.string().min(1),
  /** Received qty >= 0; short and over-receive allowed. */
  receivedQty: z.number().min(0).max(1_000_000_000),
});

export const purchaseOrderReceiveSchema = z.object({
  lines: z.array(purchaseOrderReceiveLineSchema).min(1).max(200),
});
export type PurchaseOrderReceiveInput = z.infer<typeof purchaseOrderReceiveSchema>;
