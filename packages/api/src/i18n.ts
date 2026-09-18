/** AUT-36: lightweight locale helpers for menu display names. */

export const LOCALES = ["ja", "zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ja";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Parse a loose locale tag (e.g. "zh-CN", "en-US", "ja") into our Locale. */
export function parseLocale(raw?: string | null): Locale {
  if (!raw) return DEFAULT_LOCALE;
  const lower = raw.toLowerCase().trim().replace("_", "-");
  const primary = lower.split("-")[0] ?? lower;
  if (primary === "zh") return "zh";
  if (primary === "en") return "en";
  if (primary === "ja") return "ja";
  if (isLocale(lower)) return lower;
  return DEFAULT_LOCALE;
}

/** Resolve locale from ?locale= query or Accept-Language (first tag). */
export function resolveLocaleFromRequest(req: { url: string; headers: Headers }): Locale {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("locale");
    if (q) return parseLocale(q);
  } catch {
    /* ignore invalid URL */
  }
  const al = req.headers.get("accept-language");
  if (al) {
    const first = al.split(",")[0]?.trim();
    return parseLocale(first);
  }
  return DEFAULT_LOCALE;
}

export type NamedMenuFields = {
  name: string;
  nameZh?: string | null;
  nameEn?: string | null;
};

/**
 * Localized display name.
 * - ja: Japanese primary `name`
 * - zh: nameZh → name → nameEn
 * - en: nameEn → name → nameZh
 */
export function localizedName(item: NamedMenuFields, locale: Locale): string {
  const ja = item.name?.trim() || "";
  const zh = item.nameZh?.trim() || "";
  const en = item.nameEn?.trim() || "";
  if (locale === "zh") return zh || ja || en;
  if (locale === "en") return en || ja || zh;
  return ja || zh || en;
}

/** Attach displayName for API responses without mutating domain invariants. */
export function withDisplayName<T extends NamedMenuFields>(
  item: T,
  locale: Locale
): T & { displayName: string } {
  return { ...item, displayName: localizedName(item, locale) };
}
