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

export type SessionPayload = {
  staffId: string;
  storeId: string;
  email: string;
  role: "owner" | "floor" | "kitchen";
  name: string;
};
