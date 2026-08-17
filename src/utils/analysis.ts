import { furnitureTypes } from '../data/objectCatalog';
import type { LayoutObject, LayoutProject, Point } from '../types/layout';
import { doorSwingOverlapsObject, getProjectLayoutWarnings, polygonDistance, rotatedObjectPolygon } from './collision';

export type LayoutAnalysis = {
  totalAreaM2: number; occupiedAreaM2: number; remainingAreaM2: number; occupancyRate: number;
  desks: number; chairs: number; seats: number; meetingSeats: number;
  minimumAisleMm: number | null; meetingSpaces: number; monitorTableDistanceMm: number | null;
  entranceAccessible: boolean | null; fridgeAccessible: boolean | null;
  monitorSightClear: boolean | null; warningCount: number;
};

function polygonArea(vertices: Point[]) {
  return Math.abs(vertices.reduce((sum, point, index) => { const next = vertices[(index + 1) % vertices.length]; return sum + point.x * next.y - next.x * point.y; }, 0) / 2);
}

type Interval = [number, number];
const verticalIntervals = (polygon: Point[], x: number): Interval[] => {
  const intersections: number[] = [];
  polygon.forEach((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    if ((start.x <= x && x < end.x) || (end.x <= x && x < start.x)) intersections.push(start.y + (x - start.x) * (end.y - start.y) / (end.x - start.x));
  });
  intersections.sort((a, b) => a - b);
  const result: Interval[] = [];
  for (let index = 0; index + 1 < intersections.length; index += 2) result.push([intersections[index], intersections[index + 1]]);
  return result;
};
const mergeIntervals = (values: Interval[]) => values.sort((a, b) => a[0] - b[0]).reduce<Interval[]>((result, interval) => {
  const last = result.at(-1);
  if (!last || interval[0] > last[1]) result.push([...interval]); else last[1] = Math.max(last[1], interval[1]);
  return result;
}, []);
const intersectIntervals = (first: Interval[], second: Interval[]) => {
  const result: Interval[] = [];
  first.forEach((a) => second.forEach((b) => { const start = Math.max(a[0], b[0]); const end = Math.min(a[1], b[1]); if (end > start) result.push([start, end]); }));
  return mergeIntervals(result);
};
const segmentIntersectionX = (a: Point, b: Point, c: Point, d: Point) => {
  const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denominator;
  const u = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / denominator;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return a.x + t * (b.x - a.x);
};

/** 회전 사각형 합집합을 오목한 연구실 다각형으로 자른 뒤 임계 x 구간별로 정확 적분합니다. */
export function occupiedAreaInsideRoom(room: Point[], objects: LayoutObject[]) {
  if (!objects.length) return 0;
  const polygons = objects.map(rotatedObjectPolygon);
  const all = [room, ...polygons];
  const edges = all.flatMap((polygon) => polygon.map((start, index) => [start, polygon[(index + 1) % polygon.length]] as const));
  const critical = all.flatMap((polygon) => polygon.map((point) => point.x));
  for (let first = 0; first < edges.length; first += 1) for (let second = first + 1; second < edges.length; second += 1) {
    const x = segmentIntersectionX(edges[first][0], edges[first][1], edges[second][0], edges[second][1]); if (x !== null) critical.push(x);
  }
  const xs = [...new Set(critical.map((value) => Math.round(value * 1e6) / 1e6))].sort((a, b) => a - b);
  const sliceLength = (x: number) => intersectIntervals(mergeIntervals(polygons.flatMap((polygon) => verticalIntervals(polygon, x))), verticalIntervals(room, x)).reduce((sum, interval) => sum + interval[1] - interval[0], 0);
  let area = 0;
  for (let index = 0; index + 1 < xs.length; index += 1) {
    const left = xs[index]; const right = xs[index + 1]; const width = right - left; if (width <= 1e-7) continue;
    const epsilon = Math.min(width * 1e-7, 1e-4); area += (sliceLength(left + epsilon) + sliceLength(right - epsilon)) * width / 2;
  }
  return area;
}

const pointSegmentDistance = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x; const dy = end.y - start.y; const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
};
const boundaryDistance = (polygon: Point[], room: Point[]) => Math.min(...polygon.flatMap((point) => room.map((start, index) => pointSegmentDistance(point, start, room[(index + 1) % room.length]))), ...room.flatMap((point) => polygon.map((start, index) => pointSegmentDistance(point, start, polygon[(index + 1) % polygon.length]))));

export function analyzeProject(project: LayoutProject, warningCountOverride?: number): LayoutAnalysis {
  const furniture = project.objects.filter((object) => furnitureTypes.has(object.type));
  const polygons = furniture.map(rotatedObjectPolygon);
  let minimumAisleMm: number | null = null;
  polygons.forEach((polygon) => { const distance = boundaryDistance(polygon, project.room.vertices); minimumAisleMm = minimumAisleMm === null ? distance : Math.min(minimumAisleMm, distance); });
  for (let first = 0; first < polygons.length; first += 1) for (let second = first + 1; second < polygons.length; second += 1) {
    const distance = polygonDistance(polygons[first], polygons[second]); minimumAisleMm = minimumAisleMm === null ? distance : Math.min(minimumAisleMm, distance);
  }
  const totalAreaM2 = polygonArea(project.room.vertices) / 1_000_000;
  const occupiedAreaM2 = occupiedAreaInsideRoom(project.room.vertices, furniture) / 1_000_000;
  const monitor = furniture.find((object) => object.type === 'monitor');
  const table = furniture.find((object) => object.type === 'meeting-table' && (!monitor?.spaceId || object.spaceId === monitor.spaceId)) ?? furniture.find((object) => object.type === 'meeting-table');
  const doors = project.objects.filter((object) => object.type === 'door');
  const warnings = getProjectLayoutWarnings(project);
  const entranceBlocked = doors.length ? doors.every((door) => furniture.some((object) => doorSwingOverlapsObject(door, object, project.room.vertices))) : null;
  return {
    totalAreaM2, occupiedAreaM2, remainingAreaM2: Math.max(0, totalAreaM2 - occupiedAreaM2), occupancyRate: totalAreaM2 ? occupiedAreaM2 / totalAreaM2 * 100 : 0,
    desks: furniture.filter((object) => object.type === 'desk' || object.type === 'existing-desk').length,
    chairs: furniture.filter((object) => object.type === 'chair' || object.type === 'meeting-chair').length,
    seats: furniture.reduce((sum, object) => sum + (object.seats ?? 0), 0), meetingSeats: furniture.filter((object) => object.type === 'meeting-chair').reduce((sum, object) => sum + (object.seats ?? 1), 0),
    minimumAisleMm, meetingSpaces: (project.room.spaces ?? []).filter((space) => space.type === 'meeting').length || (table ? 1 : 0),
    monitorTableDistanceMm: monitor && table ? polygonDistance(rotatedObjectPolygon(monitor), rotatedObjectPolygon(table)) : null,
    entranceAccessible: entranceBlocked === null ? null : !entranceBlocked,
    fridgeAccessible: project.objects.some((object) => object.type === 'fridge') ? !warnings.some((warning) => warning.kind === 'fridge-access') : null,
    monitorSightClear: monitor ? !warnings.some((warning) => warning.kind === 'monitor-sight') : null,
    warningCount: warningCountOverride ?? warnings.length,
  };
}
