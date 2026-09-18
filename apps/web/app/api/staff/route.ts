import { prisma } from "@shinso/db";
import { hashPassword } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

export async function GET() {
  const session = await requireSession(["owner"]);
  if (isResponse(session)) return session;
  const staff = await prisma.staff.findMany({
    where: { storeId: session.storeId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });
  return json({ staff });
}

export async function POST(req: Request) {
  const session = await requireSession(["owner"]);
  if (isResponse(session)) return session;
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.name || !body?.password || !body?.role) {
    return error("email, name, password, role が必要です");
  }
  if (!["owner", "floor", "kitchen"].includes(body.role)) {
    return error("role が不正です");
  }
  const passwordHash = await hashPassword(String(body.password));
  const staff = await prisma.staff.create({
    data: {
      storeId: session.storeId,
      email: String(body.email),
      name: String(body.name),
      role: body.role,
      passwordHash,
      active: body.active !== false,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
    },
  });
  return json({ staff }, 201);
}
