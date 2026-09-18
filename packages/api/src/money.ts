export function sumCheckItems(
  items: Array<{ unitPriceYen: number; qty: number; status: string; modifiers?: unknown }>
): number {
  return items
    .filter((i) => i.status !== "void")
    .reduce((sum, item) => {
      const mods = Array.isArray(item.modifiers)
        ? (item.modifiers as Array<{ priceYen?: number }>).reduce(
            (m, x) => m + (x.priceYen ?? 0),
            0
          )
        : 0;
      return sum + (item.unitPriceYen + mods) * item.qty;
    }, 0);
}
