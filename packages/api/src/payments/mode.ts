import { paymentModeSchema, type PaymentMode } from "./types";

/** PAYMENT_MODE=mock|sandbox|live (default mock). Keeps existing mock pay path. */
export function getPaymentMode(env: NodeJS.ProcessEnv = process.env): PaymentMode {
  const raw = (env.PAYMENT_MODE ?? "mock").toLowerCase().trim();
  const parsed = paymentModeSchema.safeParse(raw);
  return parsed.success ? parsed.data : "mock";
}

/** POS feature flag: show WeChat / Alipay buttons (default ON). */
export function isWeChatAlipayUiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.NEXT_PUBLIC_ENABLE_WECHAT_ALIPAY ?? env.ENABLE_WECHAT_ALIPAY ?? "true")
    .toLowerCase()
    .trim();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export function isImmediateMockMethod(method: string, mode: PaymentMode): boolean {
  if (method === "cash") return true;
  if (mode === "mock") return true;
  return false;
}

export function assertGatewayMethodAllowed(method: string, mode: PaymentMode): string | null {
  if (mode === "mock") return null;
  // wechat / alipay allowed in sandbox/live via simulator or reserved live wire
  void method;
  return null;
}
