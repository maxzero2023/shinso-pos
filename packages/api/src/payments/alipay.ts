import { createHmac, randomUUID } from "crypto";
import type { CreatePaymentRequest, CreatePaymentResult, PaymentGateway } from "./types";

function getAlipayKeys(env: NodeJS.ProcessEnv = process.env) {
  return {
    appId: env.ALIPAY_APP_ID?.trim() || null,
    privateKey: env.ALIPAY_PRIVATE_KEY?.trim() || null,
    publicKey: env.ALIPAY_PUBLIC_KEY?.trim() || null,
    webhookSecret: env.ALIPAY_WEBHOOK_SECRET?.trim() || null,
  };
}

export function hasAlipayCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  const k = getAlipayKeys(env);
  return Boolean(k.appId && k.privateKey);
}

/**
 * Alipay provider (访日客). Without merchant keys: sandbox simulator
 * matching a QR/deeplink payment response shape, clearly labeled.
 * Does NOT call real Alipay APIs.
 */
export function createAlipayGateway(
  env: NodeJS.ProcessEnv = process.env,
  appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
): PaymentGateway {
  const keys = getAlipayKeys(env);

  return {
    name: "alipay",
    async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
      const outTradeNo = `ali_${req.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)}`;
      const qrCode = `https://qr.alipay.com/sim_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

      if (!hasAlipayCredentials(env)) {
        const url = `${appUrl}/api/payments/alipay/simulate?outTradeNo=${encodeURIComponent(outTradeNo)}`;
        const payload = {
          code: "10000",
          msg: "Success",
          out_trade_no: outTradeNo,
          qr_code: qrCode,
          total_amount: String(req.amountYen),
          currency: "JPY",
          subject: `SHINSO check ${req.checkId}`,
          redirectUrl: url,
          simulator: true,
          label: "ALIPAY SANDBOX SIMULATOR (no merchant keys — use simulate endpoint)",
        };
        return {
          provider: "alipay",
          providerPaymentId: outTradeNo,
          clientSecret: null,
          redirectUrl: url,
          status: "pending",
          mock: true,
          providerPayload: payload,
        };
      }

      const url = `${appUrl}/alipay/pending/${outTradeNo}`;
      const payload = {
        code: "10000",
        msg: "Success",
        out_trade_no: outTradeNo,
        qr_code: qrCode,
        total_amount: String(req.amountYen),
        currency: "JPY",
        app_id: keys.appId,
        liveWire: true,
        note: "Real Alipay HTTP call requires approved merchant; payload shape reserved.",
      };

      return {
        provider: "alipay",
        providerPaymentId: outTradeNo,
        redirectUrl: url,
        status: "pending",
        mock: false,
        providerPayload: payload,
      };
    },
    async cancelPayment() {
      return { status: "canceled" as const, reason: "alipay cancel" };
    },
  };
}

export function signAlipayWebhook(body: string, secret: string, timestamp: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyAlipayWebhookSignature(
  body: string,
  signature: string,
  timestamp: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const secret = getAlipayKeys(env).webhookSecret || "alipay-sandbox-simulator-secret";
  const expected = signAlipayWebhook(body, secret, timestamp);
  if (expected.length !== signature.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return ok === 0;
}
