import { randomBytes } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { getLineMode } from "./mode";
import { sendLineMessage } from "./messaging";
import type { LineBindInput } from "./types";

function simLineUserId(): string {
  return `sim_${randomBytes(8).toString("hex")}`;
}

/**
 * Bind LINE user → Member for a store.
 * Unique (storeId, lineUserId). Simulator can omit lineUserId.
 */
export async function bindLineMember(
  db: PrismaClient,
  storeId: string,
  input: LineBindInput,
  env: NodeJS.ProcessEnv = process.env
) {
  const mode = getLineMode(env);
  let lineUserId = input.lineUserId?.trim();

  if (!lineUserId) {
    if (mode !== "simulator") {
      return {
        ok: false as const,
        status: 400,
        error: "live モードでは lineUserId が必須です（LINE Login / LIFF）",
      };
    }
    lineUserId = simLineUserId();
  }

  const displayName = input.displayName?.trim() || (mode === "simulator" ? "シミュレータ会員" : null);

  const existing = await db.member.findUnique({
    where: { storeId_lineUserId: { storeId, lineUserId } },
  });
  if (existing) {
    const updated =
      displayName && displayName !== existing.displayName
        ? await db.member.update({
            where: { id: existing.id },
            data: { displayName },
          })
        : existing;
    return {
      ok: true as const,
      status: 200,
      data: { member: updated, mode, created: false, replayed: true },
    };
  }

  const member = await db.member.create({
    data: {
      storeId,
      lineUserId,
      displayName,
      points: 0,
    },
  });

  await sendLineMessage({
    to: lineUserId,
    event: "crm.line.bind",
    message: `会員登録ありがとうございます${displayName ? `（${displayName}）` : ""}`,
    meta: { memberId: member.id, storeId, mode },
  });

  return {
    ok: true as const,
    status: 201,
    data: { member, mode, created: true, replayed: false },
  };
}
