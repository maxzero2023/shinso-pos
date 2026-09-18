import { z } from "zod";

export const paymentModeSchema = z.enum(["mock", "sandbox", "live"]);
export type PaymentMode = z.infer<typeof paymentModeSchema>;

export const paySchema = z.object({
  method: z.enum(["cash", "card", "paypay", "wechat", "alipay"]),
  amountYen: z.number().int().positive(),
  /** Client-supplied idempotency key (recommended for card/paypay). */
  idempotencyKey: z.string().min(8).max(128).optional(),
  /** Demo-only: force PayPay simulator outcome when PAYMENT_MODE=sandbox without merchant keys. */
  simulateOutcome: z.enum(["succeeded", "failed", "canceled"]).optional(),
  /** AUT-33: attach CRM member before settle for points. */
  memberId: z.string().min(1).optional(),
  lineUserId: z.string().min(1).max(128).optional(),
});

export type PayInput = z.infer<typeof paySchema>;

export type CreatePaymentRequest = {
  checkId: string;
  method: PayInput["method"];
  amountYen: number;
  idempotencyKey: string;
  mode: PaymentMode;
  currency?: "jpy";
  metadata?: Record<string, string>;
};

export type CreatePaymentResult = {
  provider: "mock" | "stripe" | "paypay";
  providerPaymentId: string;
  clientSecret?: string | null;
  /** PayPay QR / deeplink / code URL for customer scan */
  redirectUrl?: string | null;
  /** Raw provider payload shape (for debugging / simulator label) */
  providerPayload?: Record<string, unknown>;
  status: "pending" | "succeeded" | "failed" | "canceled";
  mock: boolean;
  failureReason?: string | null;
};

export interface PaymentGateway {
  readonly name: "mock" | "stripe" | "paypay";
  createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult>;
  cancelPayment?(
    providerPaymentId: string
  ): Promise<{ status: "canceled" | "failed"; reason?: string }>;
}
