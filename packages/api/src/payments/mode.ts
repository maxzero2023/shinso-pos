import { paymentModeSchema, type PaymentMode } from "./types";

/** PAYMENT_MODE=mock|sandbox|live (default mock). Keeps existing mock pay path. */
export function getPaymentMode(env: NodeJS.ProcessEnv = process.env): PaymentMode {
  const raw = (env.PAYMENT_MODE ?? "mock").toLowerCase().trim();
  const parsed = paymentModeSchema.safeParse(raw);
  return parsed.success ? parsed.data : "mock";
}

export function isImmediateMockMethod(method: string, mode: PaymentMode): boolean {
  if (method === "cash") return true;
  if (method === "wechat" || method === "alipay") return true;
  if (mode === "mock") return true;
  return false;
}

export function assertGatewayMethodAllowed(method: string, mode: PaymentMode): string | null {
  if (mode === "mock") return null;
  if (method === "wechat" || method === "alipay") {
    return "WeChat / Alipay は Q2 予定です。mock モードか card / paypay を使用してください。";
  }
  return null;
}
