import { z } from "zod";

export const hardwareModeSchema = z.enum(["simulator", "live"]);
export type HardwareMode = z.infer<typeof hardwareModeSchema>;

export const deviceTypeSchema = z.enum(["t1_pos", "kitchen_display", "printer"]);
export type DeviceType = z.infer<typeof deviceTypeSchema>;

export const deviceStatusSchema = z.enum(["online", "offline", "out_of_paper", "error"]);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

export const printJobTypeSchema = z.enum(["receipt", "kitchen"]);
export type PrintJobType = z.infer<typeof printJobTypeSchema>;

export const registerDeviceSchema = z.object({
  type: deviceTypeSchema,
  name: z.string().min(1).max(80),
  code: z.string().min(1).max(40),
  meta: z.record(z.unknown()).optional(),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const heartbeatSchema = z.object({
  status: deviceStatusSchema.optional(),
  meta: z.record(z.unknown()).optional(),
});
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

export const simulateDeviceSchema = z.object({
  status: deviceStatusSchema,
});
export type SimulateDeviceInput = z.infer<typeof simulateDeviceSchema>;

export const createPrintJobSchema = z.object({
  type: printJobTypeSchema,
  checkId: z.string().optional(),
  kitchenTicketId: z.string().optional(),
  deviceId: z.string().optional(),
  /** Allow reprint of paid check receipt. */
  reprint: z.boolean().optional(),
});
export type CreatePrintJobInput = z.infer<typeof createPrintJobSchema>;

/** Japan 80mm thermal ~32 half-width chars. */
export const RECEIPT_WIDTH_CHARS = 32;
