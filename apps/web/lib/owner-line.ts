import { prisma } from "@shinso/db";
import {
  bindOwnerLine,
  updateOwnerLineSettings,
  runOwnerLineDigest,
  type OwnerLineBindInput,
  type OwnerLineSettingsInput,
  type OwnerLineDigestKind,
  type SendLineFn,
} from "@shinso/api";

export async function getOwnerLineBinding(storeId: string) {
  return prisma.ownerLineBinding.findUnique({ where: { storeId } });
}

export async function doOwnerLineBind(storeId: string, input: OwnerLineBindInput) {
  return bindOwnerLine(prisma, storeId, input);
}

export async function doOwnerLineSettings(
  storeId: string,
  input: OwnerLineSettingsInput
) {
  return updateOwnerLineSettings(prisma, storeId, input);
}

export async function listOwnerLineDeliveryLogs(storeId: string, limit = 50) {
  return prisma.ownerLineDeliveryLog.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
}

export async function doOwnerLineTrigger(
  storeId: string,
  kind: OwnerLineDigestKind,
  opts?: { asOf?: Date; date?: string; sendFn?: SendLineFn }
) {
  return runOwnerLineDigest(prisma, storeId, kind, opts);
}
