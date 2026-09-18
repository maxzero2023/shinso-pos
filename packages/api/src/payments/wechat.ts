import { createHmac, randomUUID } from "crypto";
import type { CreatePaymentRequest, CreatePaymentResult, PaymentGateway } from "./types";

function getWeChatKeys(env: NodeJS.ProcessEnv = process.env) {
  return {
    mchId: env.WECHAT_MCH_ID?.trim() || null,
    apiKey: env.WECHAT_API_KEY?.trim() || null,
    appId: env.WECHAT_APP_ID?.trim() || null,
    webhookSecret: env.WECHAT_WEBHOOK_SECRET?.trim() || null,
  };
}

export function hasWeChatCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  const k = getWeChatKeys(env);
  return Boolean(k.mchId && k.apiKey && k.appId);
}

/**
 * WeChat Pay provider (访日客). Without merchant keys: sandbox simulator
 * matching a QR/code payment response shape, clearly labeled.
 * Does NOT call real WeChat Pay APIs.
 */
export function createWeChatGateway(
  env: NodeJS.ProcessEnv = process.env,
  appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
): PaymentGateway {
  const keys = getWeChatKeys(env);

  return {
    name: "wechat",
    async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
      const outTradeNo = `wx_${req.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)}`;
      const codeUrl = `weixin://wxpay/bizpayurl?pr=sim_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

      if (!hasWeChatCredentials(env)) {
        const url = `${appUrl}/api/payments/wechat/simulate?outTradeNo=${encodeURIComponent(outTradeNo)}`;
        const payload = {
          return_code: "SUCCESS",
          result_code: "SUCCESS",
          prepay_id: `sim_prepay_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
          code_url: codeUrl,
          out_trade_no: outTradeNo,
          total_fee: req.amountYen,
          currency: "JPY",
          body: `SHINSO check ${req.checkId}`,
          redirectUrl: url,
          simulator: true,
          label: "WECHAT SANDBOX SIMULATOR (no merchant keys — use simulate endpoint)",
        };
        return {
          provider: "wechat",
          providerPaymentId: outTradeNo,
          clientSecret: null,
          redirectUrl: url,
          status: "pending",
          mock: true,
          providerPayload: payload,
        };
      }

      const url = `${appUrl}/wechat/pending/${outTradeNo}`;
      const payload = {
        return_code: "SUCCESS",
        result_code: "SUCCESS",
        prepay_id: `live_prepay_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        code_url: codeUrl,
        out_trade_no: outTradeNo,
        total_fee: req.amountYen,
        currency: "JPY",
        mch_id: keys.mchId,
        appid: keys.appId,
        liveWire: true,
        note: "Real WeChat Pay HTTP call requires approved merchant; payload shape reserved.",
      };

      return {
        provider: "wechat",
        providerPaymentId: outTradeNo,
        redirectUrl: url,
        status: "pending",
        mock: false,
        providerPayload: payload,
      };
    },
    async cancelPayment() {
      return { status: "canceled" as const, reason: "wechat cancel" };
    },
  };
}

export function signWeChatWebhook(body: string, secret: string, timestamp: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyWeChatWebhookSignature(
  body: string,
  signature: string,
  timestamp: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const secret = getWeChatKeys(env).webhookSecret || "wechat-sandbox-simulator-secret";
  const expected = signWeChatWebhook(body, secret, timestamp);
  if (expected.length !== signature.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return ok === 0;
}
