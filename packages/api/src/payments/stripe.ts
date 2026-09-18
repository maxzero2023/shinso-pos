import Stripe from "stripe";
import type { CreatePaymentRequest, CreatePaymentResult, PaymentGateway } from "./types";

function getStripeSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.STRIPE_SECRET_KEY?.trim() || null;
}

export function getStripePublishableKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return (
    env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    env.STRIPE_PUBLISHABLE_KEY?.trim() ||
    null
  );
}

export function createStripeClient(env: NodeJS.ProcessEnv = process.env): Stripe | null {
  const key = getStripeSecret(env);
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2026-08-26.dahlia",
    typescript: true,
  });
}

export function hasStripeCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(getStripeSecret(env) && getStripePublishableKey(env));
}

/**
 * Stripe JP PaymentIntent gateway (JPY zero-decimal).
 * Without keys: labeled Stripe-shaped sandbox simulator.
 */
export function createStripeGateway(env: NodeJS.ProcessEnv = process.env): PaymentGateway {
  const stripe = createStripeClient(env);

  return {
    name: "stripe",
    async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
      if (!stripe) {
        const id = `pi_sim_${req.idempotencyKey.slice(0, 24)}`;
        const secret = `${id}_secret_sim`;
        return {
          provider: "stripe",
          providerPaymentId: id,
          clientSecret: secret,
          status: "pending",
          mock: true,
          providerPayload: {
            object: "payment_intent",
            id,
            amount: req.amountYen,
            currency: "jpy",
            status: "requires_payment_method",
            client_secret: secret,
            simulator: true,
            label: "STRIPE SANDBOX SIMULATOR (no STRIPE_SECRET_KEY)",
          },
        };
      }

      const intent = await stripe.paymentIntents.create(
        {
          amount: req.amountYen,
          currency: "jpy",
          payment_method_types: ["card"],
          metadata: {
            checkId: req.checkId,
            method: req.method,
            ...(req.metadata ?? {}),
          },
          description: `SHINSO check ${req.checkId}`,
        },
        { idempotencyKey: req.idempotencyKey }
      );

      return {
        provider: "stripe",
        providerPaymentId: intent.id,
        clientSecret: intent.client_secret,
        status: "pending",
        mock: false,
        providerPayload: {
          object: "payment_intent",
          id: intent.id,
          amount: intent.amount,
          currency: intent.currency,
          status: intent.status,
        },
      };
    },
    async cancelPayment(providerPaymentId: string) {
      if (!stripe || providerPaymentId.startsWith("pi_sim_")) {
        return { status: "canceled" as const, reason: "simulator cancel" };
      }
      const canceled = await stripe.paymentIntents.cancel(providerPaymentId);
      return {
        status: canceled.status === "canceled" ? ("canceled" as const) : ("failed" as const),
        reason: canceled.cancellation_reason ?? undefined,
      };
    },
  };
}

export function constructStripeEvent(
  rawBody: string | Buffer,
  signature: string,
  env: NodeJS.ProcessEnv = process.env
): Stripe.Event {
  const stripe = createStripeClient(env);
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    throw new Error("STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET required to verify webhooks");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
