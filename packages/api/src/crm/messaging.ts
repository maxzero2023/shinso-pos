import { getLineMode } from "./mode";

export type LineMessagePayload = {
  to: string;
  message: string;
  event: string;
  meta?: Record<string, unknown>;
};

export type LineMessageResult = {
  ok: true;
  stub: true;
  mode: "simulator" | "live";
  to: string;
  message: string;
  event: string;
  at: string;
  meta?: Record<string, unknown>;
};

/**
 * LINE Messaging API stub.
 * simulator + live-without-keys: console.log only (no network).
 */
export async function sendLineMessage(
  payload: LineMessagePayload,
  env: NodeJS.ProcessEnv = process.env
): Promise<LineMessageResult> {
  const mode = getLineMode(env);
  const result: LineMessageResult = {
    ok: true,
    stub: true,
    mode,
    to: payload.to,
    message: payload.message,
    event: payload.event,
    at: new Date().toISOString(),
    meta: payload.meta,
  };
  console.log("[line:messaging:stub]", JSON.stringify(result));
  return result;
}
