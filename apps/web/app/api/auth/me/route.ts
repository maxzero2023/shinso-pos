import { getSession } from "@/lib/session";
import { error, json } from "@/lib/http";

export async function GET() {
  const session = await getSession();
  if (!session) return error("未登录", 401);
  return json({ staff: session });
}
