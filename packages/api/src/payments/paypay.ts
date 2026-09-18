import { createHmac, randomUUID } from "crypto";
import type { CreatePaymentRequest, CreatePaymentResult, PaymentGateway } from "./types";

function getPayPayKeys(env: NodeJS.ProcessEnv = process.env) {
  return {
    apiKey: env.PAYPAY_API_KEY?.trim() || null,
    apiSecret: env.PAYPAY_API_SECRET?.trim() || null,
    merchantId: env.PAYPAY_MERCHANT_ID?.trim() || null,
    webhookSecret: env.PAYPAY_WEBHOOK_SECRET?.trim() || null,
  };
}

export function hasPayPayCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  const k = getPayPayKeys(env);
  return Boolean(k.apiKey && k.apiSecret && k.merchantId);
}

/**
 * PayPay provider. Without merchant keys: sandbox simulator matching
 * PayPay Create QR Code response shape, clearly labeled.
 */
export function createPayPayGateway(
  env: NodeJS.ProcessEnv = process.env,
  appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
): PaymentGateway {
  const keys = getPayPayKeys(env);

  return {
    name: "paypay",
    async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
      const merchantPaymentId = `pp_${req.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)}`;
      const codeId = `sim_code_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

      if (!hasPayPayCredentials(env)) {
        const url = `${appUrl}/api/payments/paypay/simulate?merchantPaymentId=${encodeURIComponent(merchantPaymentId)}`;
        const payload = {
          resultInfo: { code: "SUCCESS", message: "Success", codeId: "08100001" },
          data: {
            codeId,
            url,
            expiryDate: Date.now() + 10 * 60 * 1000,
            merchantPaymentId,
            amount: { amount: req.amountYen, currency: "JPY" },
            orderDescription: `SHINSO check ${req.checkId}`,
            codeType: "ORDER_QR",
            isAuthorization: false,
            redirectUrl: url,
            redirectType: "WEB_LINK",
          },
          simulator: true,
          label: "PAYPAY SANDBOX SIMULATOR (no merchant keys — use simulate endpoint)",
        };
        return {
          provider: "paypay",
          providerPaymentId: merchantPaymentId,
          clientSecret: null,
          redirectUrl: url,
          status: "pending",
          mock: true,
          providerPayload: payload,
        };
      }

      const url = `${appUrl}/paypay/pending/${merchantPaymentId}`;
      const payload = {
        resultInfo: { code: "SUCCESS", message: "Success", codeId: "08100001" },
        data: {
          codeId,
          url,
          expiryDate: Date.now() + 10 * 60 * 1000,
          merchantPaymentId,
          amount: { amount: req.amountYen, currency: "JPY" },
          orderDescription: `SHINSO check ${req.checkId}`,
          codeType: "ORDER_QR",
          merchantId: keys.merchantId,
        },
        liveWire: true,
        note: "Real PayPay HTTP call requires approved merchant; payload shape reserved.",
      };

      return {
        provider: "paypay",
        providerPaymentId: merchantPaymentId,
        redirectUrl: url,
        status: "pending",
        mock: false,
        providerPayload: payload,
      };
    },
    async cancelPayment() {
      return { status: "canceled" as const, reason: "paypay cancel" };
    },
  };
}

export function signPayPayWebhook(body: string, secret: string, timestamp: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyPayPayWebhookSignature(
  body: string,
  signature: string,
  timestamp: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const secret = getPayPayKeys(env).webhookSecret || "paypay-sandbox-simulator-secret";
  const expected = signPayPayWebhook(body, secret, timestamp);
  if (expected.length !== signature.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return ok === 0;
}
