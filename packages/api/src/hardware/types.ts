import { z } from "zod";

export const hardwareModeSchema = z.enum(["simulator", "live"]);
export type HardwareMode = z.infer<typeof hardwareModeSchema>;

/** Q1 standard pack + AUT-41 second Japan-common pack (simulator profiles). */
export const deviceTypeSchema = z.enum([
  "t1_pos",
  "kitchen_display",
  "printer",
  "handheld_pos",
  "kitchen_display_alt",
  "thermal_printer_alt",
]);
export type DeviceType = z.infer<typeof deviceTypeSchema>;

export const devicePackSchema = z.enum(["standard", "alt"]);
export type DevicePack = z.infer<typeof devicePackSchema>;

export const deviceStatusSchema = z.enum(["online", "offline", "out_of_paper", "error"]);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

export const printJobTypeSchema = z.enum(["receipt", "kitchen"]);
export type PrintJobType = z.infer<typeof printJobTypeSchema>;

/** Device types that can receive PrintJobs (receipt / kitchen ticket). */
export const PRINTER_DEVICE_TYPES = ["printer", "thermal_printer_alt"] as const;
export type PrinterDeviceType = (typeof PRINTER_DEVICE_TYPES)[number];

export function isPrinterDeviceType(type: string): type is PrinterDeviceType {
  return (PRINTER_DEVICE_TYPES as readonly string[]).includes(type);
}

export const registerDeviceSchema = z.object({
  type: deviceTypeSchema,
  name: z.string().min(1).max(80),
  code: z.string().min(1).max(40),
  pack: devicePackSchema.optional(),
  isPrimaryStandardPack: z.boolean().optional(),
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
  /** Explicit target; alt-pack demos use this without changing default routing. */
  deviceId: z.string().optional(),
  /** Allow reprint of paid check receipt. */
  reprint: z.boolean().optional(),
});
export type CreatePrintJobInput = z.infer<typeof createPrintJobSchema>;

/** Japan 80mm thermal ~32 half-width chars. */
export const RECEIPT_WIDTH_CHARS = 32;

/** Supported simulator profiles (compat matrix). Not a claim of all hardware. */
export const SUPPORTED_DEVICE_PROFILES = [
  {
    pack: "standard" as const,
    type: "t1_pos" as const,
    label: "SHINSO T1 POS",
    role: "FOH touch POS",
  },
  {
    pack: "standard" as const,
    type: "kitchen_display" as const,
    label: "Kitchen display",
    role: "KDS fullscreen",
  },
  {
    pack: "standard" as const,
    type: "printer" as const,
    label: "80mm thermal printer",
    role: "Receipt / kitchen ticket",
  },
  {
    pack: "alt" as const,
    type: "handheld_pos" as const,
    label: "Handheld POS (Sunmi-class)",
    role: "FOH handheld /staff",
  },
  {
    pack: "alt" as const,
    type: "kitchen_display_alt" as const,
    label: "Kitchen display (alt)",
    role: "Secondary KDS",
  },
  {
    pack: "alt" as const,
    type: "thermal_printer_alt" as const,
    label: "Thermal printer (alt)",
    role: "Alt receipt / kitchen ticket",
  },
] as const;

export function resolvePackFlags(input: {
  type: DeviceType;
  pack?: DevicePack;
  isPrimaryStandardPack?: boolean;
}): { pack: DevicePack; isPrimaryStandardPack: boolean } {
  const pack =
    input.pack ??
    (input.type === "handheld_pos" ||
    input.type === "kitchen_display_alt" ||
    input.type === "thermal_printer_alt"
      ? "alt"
      : "standard");
  const isPrimaryStandardPack =
    input.isPrimaryStandardPack ?? pack === "standard";
  return { pack, isPrimaryStandardPack: pack === "standard" ? isPrimaryStandardPack : false };
}
