import {
  getPaymentMode,
  hasStripeCredentials,
  hasPayPayCredentials,
  getStripePublishableKey,
} from "@shinso/api";
import { json } from "@/lib/http";

export async function GET() {
  const mode = getPaymentMode();
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
      wechat: { available: mode === "mock", path: "q2" },
      alipay: { available: mode === "mock", path: "q2" },
    },
  });
}
