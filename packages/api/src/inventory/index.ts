export * from "./types";

/** Decimal / number → plain number for JSON. */
export function toQtyNumber(v: { toNumber?: () => number } | number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  if (typeof v.toNumber === "function") return v.toNumber();
  return Number(v);
}
