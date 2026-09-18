import { prisma } from "@shinso/db";
import { loginSchema, verifyPassword } from "@shinso/api";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { error, json } from "@/lib/http";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const staff = await prisma.staff.findUnique({ where: { email: parsed.data.email } });
  if (!staff || !staff.active) return error("メールまたはパスワードが違います", 401);

  const ok = await verifyPassword(parsed.data.password, staff.passwordHash);
  if (!ok) return error("メールまたはパスワードが違います", 401);

  const token = await createSessionToken({
    staffId: staff.id,
    storeId: staff.storeId,
    email: staff.email,
    role: staff.role,
    name: staff.name,
  });
  await setSessionCookie(token);

  return json({
    staff: {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      storeId: staff.storeId,
    },
  });
}
