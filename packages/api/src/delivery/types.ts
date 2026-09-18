import { z } from "zod";

export const externalOrderChannels = ["demaecan", "uber_eats_jp"] as const;
export type ExternalOrderChannelName = (typeof externalOrderChannels)[number];

export const externalOrderStatuses = ["pending", "confirmed", "cancelled"] as const;
export type ExternalOrderStatusName = (typeof externalOrderStatuses)[number];

export const EXTERNAL_ORDER_STATUS_JA: Record<ExternalOrderStatusName, string> = {
  pending: "確認待ち",
  confirmed: "確認済・送厨済",
  cancelled: "キャンセル",
};

export const EXTERNAL_CHANNEL_JA: Record<ExternalOrderChannelName, string> = {
  demaecan: "出前館（シミュ）",
  uber_eats_jp: "Uber Eats（シミュ）",
};

export const simulateDeliveryWebhookSchema = z.object({
  channel: z.enum(externalOrderChannels).default("demaecan"),
  externalId: z.string().min(1).max(100).optional(),
  customerName: z.string().max(100).optional().nullable(),
  customerPhone: z.string().max(40).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  lines: z
    .array(
      z.object({
        externalItemName: z.string().min(1).max(200),
        externalItemCode: z.string().max(100).optional().nullable(),
        qty: z.number().int().min(1).max(99).default(1),
        unitPriceYen: z.number().int().min(0).max(999999).default(0),
        /** Optional pre-map hint (still pending until staff confirm) */
        menuItemId: z.string().min(1).optional().nullable(),
        note: z.string().max(200).optional().nullable(),
      })
    )
    .min(1)
    .max(50),
});

export const patchExternalOrderMappingsSchema = z.object({
  lines: z
    .array(
      z.object({
        id: z.string().min(1),
        menuItemId: z.string().min(1).nullable(),
        note: z.string().max(200).optional().nullable(),
      })
    )
    .min(1)
    .max(50),
  note: z.string().max(500).optional().nullable(),
  customerName: z.string().max(100).optional().nullable(),
  customerPhone: z.string().max(40).optional().nullable(),
});

export const confirmExternalOrderSchema = z.object({
  /** Optional override guest count; default 1 for delivery */
  guestCount: z.number().int().min(1).max(99).optional(),
});
