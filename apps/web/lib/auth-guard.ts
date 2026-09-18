import { expandAllowedRoles, type SessionPayload, type StaffRoleName } from "@shinso/api";
import { getSession } from "./session";
import { error } from "./http";

export async function requireSession(
  roles?: Array<StaffRoleName>
): Promise<SessionPayload | Response> {
  const session = await getSession();
  if (!session) return error("未登录", 401);
  const allowed = expandAllowedRoles(roles);
  if (allowed && !allowed.includes(session.role)) {
    return error("権限がありません", 403);
  }
  return session;
}

export function isResponse(v: unknown): v is Response {
  return v instanceof Response;
}

/** Active store for row-level isolation. */
export function activeStoreId(session: SessionPayload): string {
  return session.activeStoreId || session.storeId;
}
