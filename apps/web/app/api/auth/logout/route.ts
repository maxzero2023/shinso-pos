import { clearSessionCookie } from "@/lib/session";
import { json } from "@/lib/http";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  await clearSessionCookie();
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    return NextResponse.redirect(new URL("/login", req.url), 303);
  }
  return json({ ok: true });
}
