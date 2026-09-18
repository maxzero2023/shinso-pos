import { prisma } from "@shinso/db";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

export async function GET() {
  const session = await requireSession(["owner", "floor", "kitchen"]);
  if (isResponse(session)) return session;
  const areas = await prisma.area.findMany({
    where: { storeId: session.storeId },
    orderBy: { sortOrder: "asc" },
    include: { tables: { orderBy: { sortOrder: "asc" } } },
  });
  return json({ areas });
}

export async function POST(req: Request) {
  const session = await requireSession(["owner"]);
  if (isResponse(session)) return session;
  const body = await req.json().catch(() => null);
  if (!body?.name) return error("name が必要です");
  const area = await prisma.area.create({
    data: {
      storeId: session.storeId,
      name: String(body.name),
      sortOrder: Number(body.sortOrder ?? 0),
    },
  });
  return json({ area }, 201);
}
