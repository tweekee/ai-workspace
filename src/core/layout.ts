import type { Settings } from "./settings";
export function moveFurniture(
  items: Settings["furniture"],
  id: string,
  x: number,
  y: number,
): Settings["furniture"] | null {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 96 ||
    x > 300 ||
    y < 106 ||
    y > 264
  )
    return null;
  if (
    items.some(
      (d) =>
        d.id !== id &&
        x < d.x + 82 &&
        x + 82 > d.x &&
        y < d.y + 76 &&
        y + 76 > d.y,
    )
  )
    return null;
  return items.map((d) => (d.id === id ? { ...d, x, y } : d));
}
