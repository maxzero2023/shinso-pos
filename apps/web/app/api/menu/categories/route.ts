import { prisma } from "@shinso/db";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

export async function GET() {
  const session = await requireSession(["owner", "floor", "kitchen"]);
  if (isResponse(session)) return session;
  const categories = await prisma.menuCategory.findMany({
    where: { storeId: session.storeId },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          modifierGroups: {
            include: { modifiers: { orderBy: { sortOrder: "asc" } } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
  return json({ categories });
}

export async function POST(req: Request) {
  const session = await requireSession(["owner"]);
  if (isResponse(session)) return session;
  const body = await req.json().catch(() => null);
  if (!body?.name) return error("name が必要です");
  const category = await prisma.menuCategory.create({
    data: {
      storeId: session.storeId,
      name: String(body.name),
      sortOrder: Number(body.sortOrder ?? 0),
      active: body.active !== false,
    },
  });
  return json({ category }, 201);
}
