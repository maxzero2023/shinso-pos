import { getSession } from "./session";
import type { SessionPayload } from "@shinso/api";
import { error } from "./http";

export async function requireSession(
  roles?: Array<SessionPayload["role"]>
): Promise<SessionPayload | Response> {
  const session = await getSession();
  if (!session) return error("未登录", 401);
  if (roles && !roles.includes(session.role)) {
    return error("権限がありません", 403);
  }
  return session;
}

export function isResponse(v: unknown): v is Response {
  return v instanceof Response;
}
