import { lineModeSchema, type LineMode } from "./types";

/** LINE_MODE=simulator|live (default simulator). No real LINE credentials required. */
export function getLineMode(env: NodeJS.ProcessEnv = process.env): LineMode {
  const raw = (env.LINE_MODE ?? "simulator").toLowerCase().trim();
  const parsed = lineModeSchema.safeParse(raw);
  return parsed.success ? parsed.data : "simulator";
}
