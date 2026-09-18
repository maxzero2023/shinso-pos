import { hardwareModeSchema, type HardwareMode } from "./types";

/** HARDWARE_MODE=simulator|live (default simulator). Pure web works without hardware. */
export function getHardwareMode(env: NodeJS.ProcessEnv = process.env): HardwareMode {
  const raw = (env.HARDWARE_MODE ?? "simulator").toLowerCase().trim();
  const parsed = hardwareModeSchema.safeParse(raw);
  return parsed.success ? parsed.data : "simulator";
}
