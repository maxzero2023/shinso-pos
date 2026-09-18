import {
  getPaymentMode,
  hasStripeCredentials,
  hasPayPayCredentials,
  hasWeChatCredentials,
  hasAlipayCredentials,
  getStripePublishableKey,
  isWeChatAlipayUiEnabled,
} from "@shinso/api";
import { json } from "@/lib/http";

export async function GET() {
  const mode = getPaymentMode();
  const wechatAlipayUi = isWeChatAlipayUiEnabled();
  return json({
    mode,
    stripe: {
      configured: hasStripeCredentials(),
      publishableKey: getStripePublishableKey(),
      simulator: mode !== "mock" && !hasStripeCredentials(),
    },
    paypay: {
      configured: hasPayPayCredentials(),
      simulator: mode !== "mock" && !hasPayPayCredentials(),
    },
    wechat: {
      configured: hasWeChatCredentials(),
      simulator: mode !== "mock" && !hasWeChatCredentials(),
    },
    alipay: {
      configured: hasAlipayCredentials(),
      simulator: mode !== "mock" && !hasAlipayCredentials(),
    },
    features: {
      wechatAlipay: wechatAlipayUi,
    },
    methods: {
      cash: { available: true, path: "immediate" },
      card: {
        available: true,
        path: mode === "mock" ? "immediate-mock" : "stripe-payment-intent",
      },
      paypay: {
        available: true,
        path: mode === "mock" ? "immediate-mock" : "paypay-qr",
      },
      wechat: {
        available: wechatAlipayUi,
        path: mode === "mock" ? "immediate-mock" : "wechat-qr",
      },
      alipay: {
        available: wechatAlipayUi,
        path: mode === "mock" ? "immediate-mock" : "alipay-qr",
      },
    },
  });
}
