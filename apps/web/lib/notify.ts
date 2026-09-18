import type { NotifyPayload } from "@shinso/api";

export type NotifyResult = {
  ok: true;
  stub: true;
  channel: string;
  event: string;
  to: string | null;
  message: string;
  at: string;
  meta?: Record<string, unknown>;
};

/** LINE Messaging API stub — logs + returns a receipt. */
export async function sendNotify(payload: NotifyPayload): Promise<NotifyResult> {
  const result: NotifyResult = {
    ok: true,
    stub: true,
    channel: payload.channel,
    event: payload.event,
    to: payload.to ?? null,
    message: payload.message,
    at: new Date().toISOString(),
    meta: payload.meta,
  };
  console.log("[notify:stub]", JSON.stringify(result));
  return result;
}
