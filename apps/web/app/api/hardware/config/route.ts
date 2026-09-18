import { getHardwareMode } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { json } from "@/lib/http";

export async function GET() {
  const session = await requireSession(["owner", "floor", "kitchen"]);
  if (isResponse(session)) return session;
  const mode = getHardwareMode();
  return json({
    mode,
    simulator: mode === "simulator",
    receiptWidthMm: 80,
    heartbeatStaleMs: 45_000,
  });
}
