import { prisma } from "@shinso/db";
import { loginSchema, verifyPassword, type StaffRoleName } from "@shinso/api";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { resolveLoginStoreId } from "@/lib/store-access";
import { error, json } from "@/lib/http";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const staff = await prisma.staff.findUnique({ where: { email: parsed.data.email } });
  if (!staff || !staff.active) return error("メールまたはパスワードが違います", 401);

  const ok = await verifyPassword(parsed.data.password, staff.passwordHash);
  if (!ok) return error("メールまたはパスワードが違います", 401);

  const activeStoreId = await resolveLoginStoreId(staff);
  if (!activeStoreId) return error("所属店舗がありません", 403);

  const role = staff.role as StaffRoleName;
  const token = await createSessionToken({
    staffId: staff.id,
    storeId: activeStoreId,
    activeStoreId,
    brandId: staff.brandId,
    email: staff.email,
    role,
    name: staff.name,
  });
  await setSessionCookie(token);

  return json({
    staff: {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role,
      storeId: activeStoreId,
      activeStoreId,
      brandId: staff.brandId,
    },
  });
}
