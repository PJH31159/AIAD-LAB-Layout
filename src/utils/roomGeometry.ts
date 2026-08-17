import type { Point } from '../types/layout';
import { WALL_THICKNESS } from '../data/layoutConstants';

const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const onSegment = (point: Point, start: Point, end: Point) =>
  Math.abs(cross(start, end, point)) < 0.001
  && point.x >= Math.min(start.x, end.x)
  && point.x <= Math.max(start.x, end.x)
  && point.y >= Math.min(start.y, end.y)
  && point.y <= Math.max(start.y, end.y);

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  return onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}

export function segmentsProperlyIntersect(a: Point, b: Point, c: Point, d: Point) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

export function roomPolygonArea(vertices: Point[]) {
  return vertices.reduce((area, point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

export function isValidRoomPolygon(vertices: Point[], minimumEdgeLength = 100) {
  if (vertices.length < 3 || Math.abs(roomPolygonArea(vertices)) < 1) return false;
  for (let index = 0; index < vertices.length; index += 1) {
    const next = (index + 1) % vertices.length;
    if (Math.hypot(vertices[next].x - vertices[index].x, vertices[next].y - vertices[index].y) < minimumEdgeLength) return false;
    for (let other = index + 1; other < vertices.length; other += 1) {
      const otherNext = (other + 1) % vertices.length;
      const adjacent = index === other || next === other || otherNext === index;
      if (!adjacent && segmentsIntersect(vertices[index], vertices[next], vertices[other], vertices[otherNext])) return false;
    }
  }
  return true;
}

export function snapRoomVertexToOrthogonal(
  vertices: Point[],
  vertexIndex: number,
  candidate: Point,
  thresholdDegrees = 6,
  maximumDistance = Number.POSITIVE_INFINITY,
) {
  const neighbors = [
    vertices[(vertexIndex - 1 + vertices.length) % vertices.length],
    vertices[(vertexIndex + 1) % vertices.length],
  ];
  const threshold = Math.sin((thresholdDegrees * Math.PI) / 180);
  let snappedX: number | undefined;
  let snappedY: number | undefined;
  let snappedXDistance = Number.POSITIVE_INFINITY;
  let snappedYDistance = Number.POSITIVE_INFINITY;

  neighbors.forEach((neighbor) => {
    const dx = candidate.x - neighbor.x;
    const dy = candidate.y - neighbor.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    if (Math.abs(dx) <= maximumDistance && Math.abs(dx) / length <= threshold && Math.abs(dx) < snappedXDistance) {
      snappedX = neighbor.x;
      snappedXDistance = Math.abs(dx);
    }
    if (Math.abs(dy) <= maximumDistance && Math.abs(dy) / length <= threshold && Math.abs(dy) < snappedYDistance) {
      snappedY = neighbor.y;
      snappedYDistance = Math.abs(dy);
    }
  });

  return {
    point: {
      x: snappedX ?? candidate.x,
      y: snappedY ?? candidate.y,
    },
    snapped: snappedX !== undefined || snappedY !== undefined,
  };
}

function infiniteLineIntersection(a: Point, b: Point, c: Point, d: Point) {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const cdX = d.x - c.x;
  const cdY = d.y - c.y;
  const denominator = abX * cdY - abY * cdX;
  if (Math.abs(denominator) < 0.000001) return null;
  const t = ((c.x - a.x) * cdY - (c.y - a.y) * cdX) / denominator;
  return { x: a.x + abX * t, y: a.y + abY * t };
}

export function moveRoomWallParallel(vertices: Point[], wallIndex: number, distance: number) {
  const count = vertices.length;
  const startIndex = wallIndex;
  const endIndex = (wallIndex + 1) % count;
  const previousIndex = (wallIndex - 1 + count) % count;
  const nextIndex = (wallIndex + 2) % count;
  const start = vertices[startIndex];
  const end = vertices[endIndex];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const offset = { x: (-dy / length) * distance, y: (dx / length) * distance };
  const shiftedStart = { x: start.x + offset.x, y: start.y + offset.y };
  const shiftedEnd = { x: end.x + offset.x, y: end.y + offset.y };
  const moved = vertices.map((point) => ({ ...point }));

  moved[startIndex] = infiniteLineIntersection(
    vertices[previousIndex],
    start,
    shiftedStart,
    shiftedEnd,
  ) ?? shiftedStart;
  moved[endIndex] = infiniteLineIntersection(
    shiftedStart,
    shiftedEnd,
    end,
    vertices[nextIndex],
  ) ?? shiftedEnd;
  return moved;
}

export function getInteriorWallLength(vertices: Point[], wallIndex: number): number {
  const count = vertices.length;
  if (count < 2 || wallIndex < 0 || wallIndex >= count) return 0;
  const start = vertices[wallIndex];
  const end = vertices[(wallIndex + 1) % count];
  return Math.round(Math.hypot(end.x - start.x, end.y - start.y));
}

export function getRoomWallCenterline(
  vertices: Point[],
  wallIndex: number,
  thickness = WALL_THICKNESS,
): { start: Point; end: Point } | null {
  const count = vertices.length;
  if (count < 2 || wallIndex < 0 || wallIndex >= count) return null;
  const start = vertices[wallIndex];
  const end = vertices[(wallIndex + 1) % count];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const outwardDistance = roomPolygonArea(vertices) >= 0 ? -thickness / 2 : thickness / 2;
  const offset = {
    x: (-dy / length) * outwardDistance,
    y: (dx / length) * outwardDistance,
  };
  return {
    start: { x: start.x + offset.x, y: start.y + offset.y },
    end: { x: end.x + offset.x, y: end.y + offset.y },
  };
}

export type WallSegmentOuterPoints = {
  inStart: Point;
  inEnd: Point;
  outStart: Point;
  outEnd: Point;
};

export function normalizeRoomWallThicknesses(
  vertices: Point[],
  thicknesses: number[] | undefined,
  fallback = WALL_THICKNESS,
) {
  return vertices.map((_, index) => {
    const value = thicknesses?.[index];
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.max(50, Math.min(500, Math.round(value / 10) * 10))
      : fallback;
  });
}

export function getRoomWallOuterSegments(
  vertices: Point[],
  removedWallIndices: number[] = [],
  thickness: number | number[] = WALL_THICKNESS,
): (WallSegmentOuterPoints | null)[] {
  const count = vertices.length;
  if (count < 2) return vertices.map(() => null);
  const removed = new Set(removedWallIndices);
  const isClockwise = roomPolygonArea(vertices) >= 0;
  const thicknesses = Array.isArray(thickness)
    ? normalizeRoomWallThicknesses(vertices, thickness)
    : vertices.map(() => thickness);

  const wallLines = vertices.map((curr, i) => {
    if (removed.has(i)) return null;
    const next = vertices[(i + 1) % count];
    const dx = next.x - curr.x;
    const dy = next.y - curr.y;
    const len = Math.hypot(dx, dy) || 1;
    const offsetDistance = isClockwise ? -thicknesses[i] : thicknesses[i];
    const offset = { x: (-dy / len) * offsetDistance, y: (dx / len) * offsetDistance };
    return {
      start: { x: curr.x + offset.x, y: curr.y + offset.y },
      end: { x: next.x + offset.x, y: next.y + offset.y },
    };
  });

  return vertices.map((inStart, i) => {
    if (removed.has(i) || !wallLines[i]) return null;
    const nextIdx = (i + 1) % count;
    const prevIdx = (i - 1 + count) % count;
    const inEnd = vertices[nextIdx];

    const currentLine = wallLines[i]!;

    let outStart: Point;
    if (!removed.has(prevIdx) && wallLines[prevIdx]) {
      const prevLine = wallLines[prevIdx]!;
      outStart = infiniteLineIntersection(prevLine.start, prevLine.end, currentLine.start, currentLine.end) ?? currentLine.start;
    } else {
      outStart = currentLine.start;
    }

    let outEnd: Point;
    if (!removed.has(nextIdx) && wallLines[nextIdx]) {
      const nextLine = wallLines[nextIdx]!;
      outEnd = infiniteLineIntersection(currentLine.start, currentLine.end, nextLine.start, nextLine.end) ?? currentLine.end;
    } else {
      outEnd = currentLine.end;
    }

    return { inStart, inEnd, outStart, outEnd };
  });
}

export type SupplementalWallSegment = {
  start: Point;
  end: Point;
  thickness: number;
};

export function isRoomBoundaryClosed(
  vertices: Point[],
  removedWallIndices: number[] = [],
  supplementalWalls: SupplementalWallSegment[] = [],
  tolerance = 1,
): boolean {
  if (vertices.length < 3) return false;
  const removed = [...new Set(removedWallIndices)].filter((index) => index >= 0 && index < vertices.length);
  if (removed.length === 0) return true;

  return removed.every((index) => {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return false;
    const unit = { x: dx / length, y: dy / length };
    const intervals = supplementalWalls.flatMap((wall) => {
      const wallDx = wall.end.x - wall.start.x;
      const wallDy = wall.end.y - wall.start.y;
      const wallLength = Math.hypot(wallDx, wallDy);
      if (wallLength === 0) return [];
      const parallelError = Math.abs(unit.x * (wallDy / wallLength) - unit.y * (wallDx / wallLength));
      if (parallelError > 0.02) return [];
      const perpendicularDistance = (point: Point) =>
        Math.abs((point.x - start.x) * unit.y - (point.y - start.y) * unit.x);
      const maximumOffset = wall.thickness / 2 + tolerance;
      if (perpendicularDistance(wall.start) > maximumOffset || perpendicularDistance(wall.end) > maximumOffset) return [];
      const project = (point: Point) => (point.x - start.x) * unit.x + (point.y - start.y) * unit.y;
      const intervalStart = Math.max(0, Math.min(project(wall.start), project(wall.end)));
      const intervalEnd = Math.min(length, Math.max(project(wall.start), project(wall.end)));
      return intervalEnd >= intervalStart ? [{ start: intervalStart, end: intervalEnd }] : [];
    }).sort((first, second) => first.start - second.start);

    let coveredUntil = 0;
    for (const interval of intervals) {
      if (interval.start > coveredUntil + tolerance) return false;
      coveredUntil = Math.max(coveredUntil, interval.end);
      if (coveredUntil >= length - tolerance) return true;
    }
    return coveredUntil >= length - tolerance;
  });
}
