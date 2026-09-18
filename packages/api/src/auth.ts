import bcrypt from "bcryptjs";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export type StaffRoleName =
  | "brand_admin"
  | "owner"
  | "manager"
  | "floor"
  | "kitchen";

export type SessionPayload = {
  staffId: string;
  /** Active store for row-level isolation (alias kept for existing APIs). */
  storeId: string;
  /** Explicit active store id (same as storeId after login / switch-store). */
  activeStoreId: string;
  brandId: string | null;
  email: string;
  role: StaffRoleName;
  name: string;
};

export const switchStoreSchema = z.object({
  storeId: z.string().min(1),
});

export const brandCreateSchema = z.object({
  name: z.string().min(1).max(120),
});

export const brandUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

export const storeCreateSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().min(1).max(120),
  timezone: z.string().min(1).default("Asia/Tokyo"),
});

export const storeUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  timezone: z.string().min(1).optional(),
});

/** Roles that may manage Brand / Store CRUD and switch across brand stores. */
export const BRAND_ADMIN_ROLES: StaffRoleName[] = ["brand_admin"];

/** Store-scoped elevated roles (plus brand_admin when acting on a store). */
export const STORE_ELEVATED_ROLES: StaffRoleName[] = [
  "brand_admin",
  "owner",
  "manager",
];

/** Simple permission matrix for Admin UI / docs. */
export const PERMISSION_MATRIX: Array<{
  action: string;
  brand_admin: boolean;
  owner: boolean;
  manager: boolean;
  floor: boolean;
  kitchen: boolean;
}> = [
  { action: "CRUD Brand / Store", brand_admin: true, owner: false, manager: false, floor: false, kitchen: false },
  { action: "Switch to any store in brand", brand_admin: true, owner: false, manager: false, floor: false, kitchen: false },
  { action: "Admin menu / tables / staff", brand_admin: true, owner: true, manager: true, floor: false, kitchen: false },
  { action: "FOH POS / open table / order", brand_admin: true, owner: true, manager: true, floor: true, kitchen: false },
  { action: "Kitchen display", brand_admin: true, owner: true, manager: true, floor: true, kitchen: true },
  { action: "Reports / CRM", brand_admin: true, owner: true, manager: true, floor: true, kitchen: false },
];
