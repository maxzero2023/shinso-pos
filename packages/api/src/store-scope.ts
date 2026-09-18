import type { SessionPayload, StaffRoleName } from "./auth";

export function getActiveStoreId(session: SessionPayload): string {
  return session.activeStoreId || session.storeId;
}

export function isBrandAdmin(role: StaffRoleName): boolean {
  return role === "brand_admin";
}

export function isStoreElevated(role: StaffRoleName): boolean {
  return role === "brand_admin" || role === "owner" || role === "manager";
}

/**
 * Expand role allow-lists so brand_admin / manager inherit owner-level
 * store-scoped privileges without rewriting every route.
 */
export function expandAllowedRoles(
  roles?: StaffRoleName[]
): StaffRoleName[] | undefined {
  if (!roles) return undefined;
  const set = new Set(roles);
  if (set.has("owner")) {
    set.add("brand_admin");
    set.add("manager");
  }
  return [...set];
}

export function canSwitchToStore(opts: {
  role: StaffRoleName;
  brandId: string | null;
  homeStoreId: string | null;
  targetStore: { id: string; brandId: string };
}): boolean {
  if (isBrandAdmin(opts.role)) {
    if (!opts.brandId) return false;
    return opts.targetStore.brandId === opts.brandId;
  }
  return opts.homeStoreId != null && opts.targetStore.id === opts.homeStoreId;
}
