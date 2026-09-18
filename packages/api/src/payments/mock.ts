import type { CreatePaymentRequest, CreatePaymentResult, PaymentGateway } from "./types";

export const mockGateway: PaymentGateway = {
  name: "mock",
  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    return {
      provider: "mock",
      providerPaymentId: `mock_${req.idempotencyKey}`,
      status: "succeeded",
      mock: true,
      clientSecret: null,
      redirectUrl: null,
      providerPayload: { mode: "mock", method: req.method },
    };
  },
};
