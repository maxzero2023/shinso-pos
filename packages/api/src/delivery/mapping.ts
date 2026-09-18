/**
 * Suggest MenuItem id by fuzzy name match (exact → includes).
 * Used only as a *hint* on simulate; staff must still confirm (semi-auto).
 */
export function suggestMenuItemId(
  externalName: string,
  menuItems: Array<{ id: string; name: string; nameZh?: string | null; nameEn?: string | null; active: boolean }>
): string | null {
  const needle = externalName.trim().toLowerCase();
  if (!needle) return null;
  const active = menuItems.filter((m) => m.active);
  const exact = active.find(
    (m) =>
      m.name.toLowerCase() === needle ||
      (m.nameZh && m.nameZh.toLowerCase() === needle) ||
      (m.nameEn && m.nameEn.toLowerCase() === needle)
  );
  if (exact) return exact.id;
  const partial = active.find(
    (m) =>
      m.name.toLowerCase().includes(needle) ||
      needle.includes(m.name.toLowerCase()) ||
      (m.nameZh && (m.nameZh.toLowerCase().includes(needle) || needle.includes(m.nameZh.toLowerCase()))) ||
      (m.nameEn && (m.nameEn.toLowerCase().includes(needle) || needle.includes(m.nameEn.toLowerCase())))
  );
  return partial?.id ?? null;
}

/** Validate all lines have a menuItemId before confirm. */
export function findUnmappedLines(
  lines: Array<{ id: string; externalItemName: string; menuItemId: string | null }>
): Array<{ id: string; externalItemName: string }> {
  return lines
    .filter((l) => !l.menuItemId)
    .map((l) => ({ id: l.id, externalItemName: l.externalItemName }));
}
