export interface Point {
  x: number;
  y: number;
}
export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}
const step = 8;
export function findPath(
  from: Point,
  to: Point,
  obstacles: Obstacle[],
): Point[] {
  const snap = (p: Point) => ({
    x: Math.round(p.x / step) * step,
    y: Math.round(p.y / step) * step,
  });
  const start = snap(from),
    end = snap(to);
  const key = (p: Point) => p.x + "," + p.y;
  const blocked = (p: Point) =>
    p.x < 32 ||
    p.x > 480 ||
    p.y < 96 ||
    p.y > 336 ||
    obstacles.some(
      (o) =>
        p.x >= o.x - 7 &&
        p.x <= o.x + o.width + 7 &&
        p.y >= o.y - 3 &&
        p.y <= o.y + o.height + 4,
    );
  if (blocked(end)) return [];
  const queue = [start],
    visited = new Set([key(start)]),
    parents = new Map<string, Point>();
  while (queue.length) {
    const current = queue.shift()!;
    if (key(current) === key(end)) {
      const path = [end];
      let p = end;
      while (key(p) !== key(start)) {
        p = parents.get(key(p))!;
        path.unshift(p);
      }
      return path;
    }
    for (const [dx, dy] of [
      [step, 0],
      [-step, 0],
      [0, step],
      [0, -step],
    ]) {
      const p = { x: current.x + dx, y: current.y + dy },
        k = key(p);
      if (!visited.has(k) && !blocked(p)) {
        visited.add(k);
        parents.set(k, current);
        queue.push(p);
      }
    }
  }
  return [];
}
