import {
  canReadReports,
  expenseCreateSchema,
  expenseListQuerySchema,
  tokyoYmd,
} from "@shinso/api";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { createExpense, listExpenses } from "@/lib/finance";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "manager", "floor"]);
  if (isResponse(session)) return session;
  if (!canReadReports(session.role)) return error("権限がありません", 403);

  const storeId = activeStoreId(session);
  const url = new URL(req.url);
  const raw = {
    date: url.searchParams.get("date") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };
  const parsed = expenseListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return error(parsed.error.errors[0]?.message ?? "無効なクエリです", 400);
  }

  const expenses = await listExpenses(storeId, parsed.data);
  const totalYen = expenses.reduce((s, e) => s + e.amountYen, 0);
  return json({
    expenses,
    totalYen,
    disclaimer: "経営分析用の概算です。法定帳務・税務申告の代替ではありません。",
    statutoryAccounting: false,
  });
}

export async function POST(req: Request) {
  const session = await requireSession(["owner", "manager"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);

  const body = await req.json().catch(() => null);
  const parsed = expenseCreateSchema.safeParse(body);
  if (!parsed.success) {
    return error("入力が不正です", 400, { details: parsed.error.flatten() });
  }

  // Default date to today Tokyo if somehow missing (schema requires it)
  const input = {
    ...parsed.data,
    date: parsed.data.date || tokyoYmd(new Date()),
  };

  const expense = await createExpense(storeId, session.staffId, input);
  return json(
    {
      expense,
      disclaimer: "経営分析用の概算です。法定帳務・税務申告の代替ではありません。",
      statutoryAccounting: false,
    },
    201
  );
}
