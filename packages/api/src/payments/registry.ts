import { mockGateway } from "./mock";
import { createStripeGateway } from "./stripe";
import { createPayPayGateway } from "./paypay";
import { createWeChatGateway } from "./wechat";
import { createAlipayGateway } from "./alipay";
import { getPaymentMode, isImmediateMockMethod } from "./mode";
import type {
  CreatePaymentRequest,
  CreatePaymentResult,
  PaymentGateway,
  PaymentMode,
} from "./types";

export function resolveGateway(
  method: string,
  mode: PaymentMode = getPaymentMode()
): PaymentGateway {
  if (isImmediateMockMethod(method, mode)) return mockGateway;
  if (method === "card") return createStripeGateway();
  if (method === "paypay") return createPayPayGateway();
  if (method === "wechat") return createWeChatGateway();
  if (method === "alipay") return createAlipayGateway();
  return mockGateway;
}

export async function createProviderPayment(
  req: Omit<CreatePaymentRequest, "mode"> & { mode?: PaymentMode }
): Promise<CreatePaymentResult> {
  const mode = req.mode ?? getPaymentMode();
  const gateway = resolveGateway(req.method, mode);
  return gateway.createPayment({ ...req, mode });
}
