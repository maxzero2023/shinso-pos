import type { PrismaClient, Device, DeviceStatus, PrintJob } from "@prisma/client";
import { getHardwareMode } from "./mode";
import {
  formatKitchenTicketHtml,
  formatKitchenTicketText,
  formatReceiptHtml,
  formatReceiptText,
  type KitchenTicketPayload,
  type ReceiptPayload,
} from "./receipt";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

const OFFLINE_MS = 45_000;

export function isDeviceEffectivelyOffline(
  device: Pick<Device, "status" | "lastHeartbeatAt">,
  now = new Date()
): boolean {
  if (device.status === "offline" || device.status === "error") return true;
  if (!device.lastHeartbeatAt) return true;
  return now.getTime() - device.lastHeartbeatAt.getTime() > OFFLINE_MS;
}

export function devicePrintError(
  device: Pick<Device, "status" | "name" | "lastHeartbeatAt"> | null
): string | null {
  if (!device) return "プリンタが登録されていません";
  if (device.status === "out_of_paper") return `プリンタ「${device.name}」用紙切れです`;
  if (isDeviceEffectivelyOffline(device)) return `プリンタ「${device.name}」がオフラインです`;
  if (device.status === "error") return `プリンタ「${device.name}」エラー`;
  return null;
}

async function findPrinter(db: PrismaClient | Tx, storeId: string, deviceId?: string) {
  if (deviceId) {
    return db.device.findFirst({ where: { id: deviceId, storeId, type: "printer" } });
  }
  return db.device.findFirst({
    where: { storeId, type: "printer" },
    orderBy: { createdAt: "asc" },
  });
}

export async function processPrintJob(
  db: PrismaClient | Tx,
  jobId: string
): Promise<PrintJob> {
  const mode = getHardwareMode();
  const job = await db.printJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`PrintJob not found: ${jobId}`);

  await db.printJob.update({
    where: { id: jobId },
    data: { status: "printing", errorMessage: null },
  });

  const printer = job.deviceId
    ? await db.device.findUnique({ where: { id: job.deviceId } })
    : await findPrinter(db, job.storeId);

  if (mode === "live") {
    return db.printJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage:
          "LIVE モード: 実機ブリッジ未接続（HARDWARE_MODE=simulator でデモしてください）",
        deviceId: printer?.id ?? job.deviceId,
      },
    });
  }

  const err = devicePrintError(printer);
  if (err) {
    return db.printJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: err,
        deviceId: printer?.id ?? job.deviceId,
      },
    });
  }

  return db.printJob.update({
    where: { id: jobId },
    data: {
      status: "printed",
      printedAt: new Date(),
      errorMessage: null,
      deviceId: printer?.id ?? job.deviceId,
    },
  });
}

export async function enqueueReceiptPrint(
  db: PrismaClient | Tx,
  opts: { storeId: string; checkId: string; payload: ReceiptPayload; deviceId?: string }
): Promise<PrintJob> {
  const printer = await findPrinter(db, opts.storeId, opts.deviceId);
  const job = await db.printJob.create({
    data: {
      storeId: opts.storeId,
      deviceId: printer?.id ?? null,
      type: "receipt",
      status: "queued",
      checkId: opts.checkId,
      contentText: formatReceiptText(opts.payload),
      contentHtml: formatReceiptHtml(opts.payload),
    },
  });
  return processPrintJob(db, job.id);
}

export async function enqueueKitchenPrint(
  db: PrismaClient | Tx,
  opts: {
    storeId: string;
    checkId: string;
    kitchenTicketId: string;
    payload: KitchenTicketPayload;
    deviceId?: string;
  }
): Promise<PrintJob> {
  const printer = await findPrinter(db, opts.storeId, opts.deviceId);
  const job = await db.printJob.create({
    data: {
      storeId: opts.storeId,
      deviceId: printer?.id ?? null,
      type: "kitchen",
      status: "queued",
      checkId: opts.checkId,
      kitchenTicketId: opts.kitchenTicketId,
      contentText: formatKitchenTicketText(opts.payload),
      contentHtml: formatKitchenTicketHtml(opts.payload),
    },
  });
  return processPrintJob(db, job.id);
}

export async function refreshStaleDeviceStatuses(
  db: PrismaClient | Tx,
  storeId: string,
  now = new Date()
): Promise<number> {
  const devices = await db.device.findMany({
    where: { storeId, status: { in: ["online", "out_of_paper"] } },
  });
  let n = 0;
  for (const d of devices) {
    if (isDeviceEffectivelyOffline(d, now) && d.status !== "out_of_paper") {
      await db.device.update({ where: { id: d.id }, data: { status: "offline" } });
      n++;
    }
  }
  return n;
}

export type DeviceHealth = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: DeviceStatus;
  lastHeartbeatAt: Date | null;
  effectivelyOffline: boolean;
  printError: string | null;
};
