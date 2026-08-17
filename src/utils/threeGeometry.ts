import type { LayoutObject, Point } from '../types/layout';

export type WallOpening = {
  start: number;
  end: number;
  bottom: number;
  top: number;
};

export type WallSection = {
  start: number;
  end: number;
  bottom: number;
  top: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export function wallOpeningForObject(
  object: LayoutObject,
  wallStart: Point,
  wallEnd: Point,
  wallHeight: number,
): WallOpening | null {
  if (object.type !== 'door' && object.type !== 'window') return null;
  const dx = wallEnd.x - wallStart.x;
  const dy = wallEnd.y - wallStart.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;
  const wallAxis = { x: dx / length, y: dy / length };
  const radians = object.rotation * Math.PI / 180;
  const objectAxis = { x: Math.cos(radians), y: Math.sin(radians) };
  const center = { x: object.x + object.width / 2, y: object.y + object.depth / 2 };
  const endpoints = [-1, 1].map((direction) => ({
    x: center.x + objectAxis.x * object.width / 2 * direction,
    y: center.y + objectAxis.y * object.width / 2 * direction,
  }));
  const distances = endpoints.map((point) =>
    (point.x - wallStart.x) * wallAxis.x + (point.y - wallStart.y) * wallAxis.y);
  const start = clamp(Math.min(...distances), 0, length);
  const end = clamp(Math.max(...distances), 0, length);
  if (end - start < 1) return null;
  const bottom = object.type === 'window' ? 900 : 0;
  const openingHeight = object.height ?? (object.type === 'window' ? 1200 : 2100);
  return { start, end, bottom, top: Math.min(wallHeight, bottom + openingHeight) };
}

export function splitWallSections(length: number, wallHeight: number, openings: WallOpening[]): WallSection[] {
  const normalized = openings
    .map((opening) => ({
      start: clamp(Math.min(opening.start, opening.end), 0, length),
      end: clamp(Math.max(opening.start, opening.end), 0, length),
      bottom: clamp(Math.min(opening.bottom, opening.top), 0, wallHeight),
      top: clamp(Math.max(opening.bottom, opening.top), 0, wallHeight),
    }))
    .filter((opening) => opening.end - opening.start >= 1 && opening.top - opening.bottom >= 1);
  const horizontalBreaks = [...new Set([0, length, ...normalized.flatMap((opening) => [opening.start, opening.end])])]
    .sort((first, second) => first - second);
  const sections: WallSection[] = [];
  for (let index = 0; index < horizontalBreaks.length - 1; index += 1) {
    const start = horizontalBreaks[index];
    const end = horizontalBreaks[index + 1];
    if (end - start < 1) continue;
    const midpoint = (start + end) / 2;
    const holes = normalized
      .filter((opening) => opening.start < midpoint && opening.end > midpoint)
      .map((opening) => [opening.bottom, opening.top] as [number, number])
      .sort((first, second) => first[0] - second[0]);
    const merged: [number, number][] = [];
    holes.forEach(([bottom, top]) => {
      const previous = merged.at(-1);
      if (previous && bottom <= previous[1]) previous[1] = Math.max(previous[1], top);
      else merged.push([bottom, top]);
    });
    let cursor = 0;
    merged.forEach(([bottom, top]) => {
      if (bottom - cursor >= 1) sections.push({ start, end, bottom: cursor, top: bottom });
      cursor = Math.max(cursor, top);
    });
    if (wallHeight - cursor >= 1) sections.push({ start, end, bottom: cursor, top: wallHeight });
  }
  return sections;
}

const interpolate = (start: Point, end: Point, ratio: number): Point => ({
  x: start.x + (end.x - start.x) * ratio,
  y: start.y + (end.y - start.y) * ratio,
});

export function sliceWallPolygon(
  innerStart: Point,
  innerEnd: Point,
  outerStart: Point,
  outerEnd: Point,
  startRatio: number,
  endRatio: number,
): Point[] {
  return [
    interpolate(innerStart, innerEnd, startRatio),
    interpolate(innerStart, innerEnd, endRatio),
    interpolate(outerStart, outerEnd, endRatio),
    interpolate(outerStart, outerEnd, startRatio),
  ];
}
