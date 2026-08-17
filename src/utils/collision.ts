import { furnitureTypes } from '../data/objectCatalog';
import type { LayoutObject, LayoutProject, LayoutWarning, Point } from '../types/layout';
import { isRoomBoundaryClosed, segmentsProperlyIntersect } from './roomGeometry';
import { getWallEndpoints, roomInteriorSwingSign } from './structurePlacement';
import { getClosedWallLoops } from './wallGeometry';

const aisleRelevantTypes = new Set<LayoutObject['type']>([
  'desk',
  'meeting-table',
  'cabinet',
  'shelf',
  'partition',
  'custom',
]);

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  const onBoundary = polygon.some((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    const cross = (point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x);
    if (Math.abs(cross) > 0.001) return false;
    const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
    if (dot < 0) return false;
    const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
    return dot <= lengthSquared;
  });
  if (onBoundary) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function rotatedObjectPolygon(object: LayoutObject): Point[] {
  const center = { x: object.x + object.width / 2, y: object.y + object.depth / 2 };
  const radians = object.rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    { x: object.x, y: object.y },
    { x: object.x + object.width, y: object.y },
    { x: object.x + object.width, y: object.y + object.depth },
    { x: object.x, y: object.y + object.depth },
  ].map((point) => ({
    x: center.x + (point.x - center.x) * cos - (point.y - center.y) * sin,
    y: center.y + (point.x - center.x) * sin + (point.y - center.y) * cos,
  }));
}

export function doorSwingPolygon(door: LayoutObject, roomVertices: Point[]): Point[] {
  const center = { x: door.x + door.width / 2, y: door.y + door.depth / 2 };
  const hingeLeft = (door.doorHinge ?? 'left') === 'left';
  const inward = roomInteriorSwingSign(roomVertices);
  const swingSign = (door.doorSwing ?? 'inward') === 'inward' ? inward : -inward;
  const hinge = { x: hingeLeft ? door.x : door.x + door.width, y: center.y };
  const closedAngle = hingeLeft ? 0 : Math.PI;
  const angleDelta = (hingeLeft ? swingSign : -swingSign) * Math.max(10, Math.min(180, door.doorOpeningAngle ?? 90)) * Math.PI / 180;
  const localPoints = [hinge, ...Array.from({ length: 13 }, (_, index) => {
    const angle = closedAngle + angleDelta * index / 12;
    return { x: hinge.x + Math.cos(angle) * door.width, y: hinge.y + Math.sin(angle) * door.width };
  })];
  const radians = door.rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return localPoints.map((point) => ({
    x: center.x + (point.x - center.x) * cos - (point.y - center.y) * sin,
    y: center.y + (point.x - center.x) * sin + (point.y - center.y) * cos,
  }));
}

const segmentsIntersectInclusive = (a: Point, b: Point, c: Point, d: Point) => {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c); const abD = cross(a, b, d); const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  const boxesOverlap = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) + 1e-7
    && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) + 1e-7;
  return boxesOverlap && abC * abD <= 1e-7 && cdA * cdB <= 1e-7;
};

/** 회전 사각형과 문의 원형 부채꼴을 원호 방정식으로 직접 교차 판정합니다. */
export function doorSwingOverlapsObject(door: LayoutObject, object: LayoutObject, roomVertices: Point[]) {
  const center = { x: door.x + door.width / 2, y: door.y + door.depth / 2 };
  const radians = -door.rotation * Math.PI / 180; const cos = Math.cos(radians); const sin = Math.sin(radians);
  const local = (point: Point) => ({ x: center.x + (point.x - center.x) * cos - (point.y - center.y) * sin, y: center.y + (point.x - center.x) * sin + (point.y - center.y) * cos });
  const hingeLeft = (door.doorHinge ?? 'left') === 'left'; const hinge = { x: hingeLeft ? door.x : door.x + door.width, y: door.y + door.depth / 2 };
  const inward = roomInteriorSwingSign(roomVertices); const swingSign = (door.doorSwing ?? 'inward') === 'inward' ? inward : -inward;
  const sweepSign = hingeLeft ? swingSign : -swingSign; const startAngle = hingeLeft ? 0 : Math.PI; const sweep = Math.max(10, Math.min(180, door.doorOpeningAngle ?? 90)) * Math.PI / 180;
  const polygon = rotatedObjectPolygon(object).map(local).map((point) => ({ x: point.x - hinge.x, y: point.y - hinge.y }));
  const normalize = (angle: number) => ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const inSweep = (point: Point) => {
    const delta = sweepSign > 0 ? normalize(Math.atan2(point.y, point.x) - startAngle) : normalize(startAngle - Math.atan2(point.y, point.x));
    return delta <= sweep + 1e-7;
  };
  if (polygon.some((point) => Math.hypot(point.x, point.y) <= door.width + 1e-7 && inSweep(point))) return true;
  if (pointInPolygon({ x: 0, y: 0 }, polygon)) return true;
  const ray = (angle: number) => ({ x: Math.cos(angle) * door.width, y: Math.sin(angle) * door.width });
  const endAngle = startAngle + sweepSign * sweep; const radialEnds = [ray(startAngle), ray(endAngle)];
  if (radialEnds.some((end) => polygon.some((start, index) => segmentsIntersectInclusive({ x: 0, y: 0 }, end, start, polygon[(index + 1) % polygon.length])))) return true;
  return polygon.some((start, index) => {
    const end = polygon[(index + 1) % polygon.length]; const dx = end.x - start.x; const dy = end.y - start.y;
    const a = dx * dx + dy * dy; const b = 2 * (start.x * dx + start.y * dy); const c = start.x * start.x + start.y * start.y - door.width * door.width;
    const discriminant = b * b - 4 * a * c; if (discriminant < 0 || a === 0) return false;
    const root = Math.sqrt(discriminant); return [(-b - root) / (2 * a), (-b + root) / (2 * a)].some((t) => t >= 0 && t <= 1 && inSweep({ x: start.x + dx * t, y: start.y + dy * t }));
  });
}

function polygonAxes(polygon: Point[]) {
  return polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const edge = { x: next.x - point.x, y: next.y - point.y };
    const length = Math.hypot(edge.x, edge.y) || 1;
    return { x: -edge.y / length, y: edge.x / length };
  });
}

export function polygonsOverlap(first: Point[], second: Point[]) {
  return [...polygonAxes(first), ...polygonAxes(second)].every((axis) => {
    const firstProjection = first.map((point) => point.x * axis.x + point.y * axis.y);
    const secondProjection = second.map((point) => point.x * axis.x + point.y * axis.y);
    return Math.max(...firstProjection) > Math.min(...secondProjection)
      && Math.max(...secondProjection) > Math.min(...firstProjection);
  });
}

const pointSegmentDistance = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x; const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
};

export function polygonDistance(first: Point[], second: Point[]) {
  if (polygonsOverlap(first, second) || first.some((point) => pointInPolygon(point, second)) || second.some((point) => pointInPolygon(point, first))) return 0;
  let distance = Number.POSITIVE_INFINITY;
  first.forEach((point) => second.forEach((start, index) => { distance = Math.min(distance, pointSegmentDistance(point, start, second[(index + 1) % second.length])); }));
  second.forEach((point) => first.forEach((start, index) => { distance = Math.min(distance, pointSegmentDistance(point, start, first[(index + 1) % first.length])); }));
  return distance;
}

export function objectsOverlap(a: LayoutObject, b: LayoutObject): boolean {
  return polygonsOverlap(rotatedObjectPolygon(a), rotatedObjectPolygon(b));
}

function objectOutsideRoom(object: LayoutObject, polygon: Point[]): boolean {
  const corners = rotatedObjectPolygon(object);
  if (corners.some((corner) => !pointInPolygon(corner, polygon))) return true;
  return corners.some((start, index) => {
    const end = corners[(index + 1) % corners.length];
    return polygon.some((wallStart, wallIndex) =>
      segmentsProperlyIntersect(start, end, wallStart, polygon[(wallIndex + 1) % polygon.length]));
  });
}

export function getLayoutWarnings(
  objects: LayoutObject[],
  roomVertices: Point[],
  minimumAisleWidth = 0,
  additionalRoomPolygons: Point[][] = [],
  roomBoundaryClosed = true,
): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];
  const roomPolygons = [
    ...(roomBoundaryClosed ? [roomVertices] : []),
    ...additionalRoomPolygons,
  ];
  const checkedOutside = objects.filter(
    (object) => furnitureTypes.has(object.type) || object.type === 'column',
  );

  checkedOutside.forEach((object) => {
    if (roomPolygons.length > 0 && roomPolygons.every((polygon) => objectOutsideRoom(object, polygon))) {
      warnings.push({
        id: `outside-${object.id}`,
        objectIds: [object.id],
        kind: 'outside',
        message: `연구실 외부로 벗어난 객체가 있습니다: ${object.name}.`,
      });
    }
  });

  const furniture = objects.filter((object) => furnitureTypes.has(object.type));
  furniture.forEach((object, index) => {
    furniture.slice(index + 1).forEach((other) => {
      if (objectsOverlap(object, other)) {
        warnings.push({
          id: `overlap-${object.id}-${other.id}`,
          objectIds: [object.id, other.id],
          kind: 'overlap',
          message: `서로 겹치는 객체가 있습니다: ${object.name}, ${other.name}.`,
        });
      } else if (minimumAisleWidth > 0 && aisleRelevantTypes.has(object.type) && aisleRelevantTypes.has(other.type)) {
        const clearance = polygonDistance(rotatedObjectPolygon(object), rotatedObjectPolygon(other));
        if (clearance < minimumAisleWidth) {
          warnings.push({
            id: `aisle-${object.id}-${other.id}`,
            objectIds: [object.id, other.id],
            kind: 'aisle',
            message: `가구 사이 간격이 최소 통로 폭보다 좁습니다: ${object.name}, ${other.name} (${Math.round(clearance).toLocaleString('ko-KR')} mm).`,
          });
        }
      }
    });
  });

  const columns = objects.filter((object) => object.type === 'column');
  furniture.forEach((object) => {
    columns.forEach((column) => {
      if (objectsOverlap(object, column)) {
        warnings.push({
          id: `column-${object.id}-${column.id}`,
          objectIds: [object.id, column.id],
          kind: 'column-overlap',
          message: `기둥과 겹치는 객체가 있습니다: ${object.name}, ${column.name}.`,
        });
      }
    });
  });

  const doors = objects.filter((object) => object.type === 'door');
  doors.forEach((door) => {
    furniture.forEach((object) => {
      if (doorSwingOverlapsObject(door, object, roomVertices)) {
        warnings.push({
          id: `door-swing-${door.id}-${object.id}`,
          objectIds: [door.id, object.id],
          kind: 'door-swing',
          message: `문 열림 공간에 가구가 있습니다: ${door.name}, ${object.name}.`,
        });
      }
    });
  });

  const glassWalls = objects.filter((object) => object.type === 'glass-wall');
  furniture.filter((object) => object.type !== 'monitor').forEach((object) => glassWalls.forEach((glass) => {
    const clearance = polygonDistance(rotatedObjectPolygon(object), rotatedObjectPolygon(glass));
    if (clearance < 300) warnings.push({ id: `glass-${object.id}-${glass.id}`, objectIds: [object.id, glass.id], kind: 'glass-clearance', message: `${object.name}의 유리벽 안전거리가 ${Math.round(clearance).toLocaleString('ko-KR')} mm로 기준 300 mm보다 좁습니다.` });
  }));

  const zone = (target: LayoutObject, offset: number, width: number, depth: number, perpendicular = false): LayoutObject => {
    const radians = target.rotation * Math.PI / 180;
    const direction = perpendicular ? { x: -Math.sin(radians), y: Math.cos(radians) } : { x: -Math.cos(radians), y: -Math.sin(radians) };
    const center = { x: target.x + target.width / 2 + direction.x * offset, y: target.y + target.depth / 2 + direction.y * offset };
    return { ...target, id: `${target.id}-zone`, x: center.x - width / 2, y: center.y - depth / 2, width, depth };
  };
  const fridge = furniture.find((object) => object.type === 'fridge');
  if (fridge) {
    const access = rotatedObjectPolygon(zone(fridge, 1000, 1200, 1000));
    const blocker = furniture.find((object) => object.id !== fridge.id && polygonsOverlap(access, rotatedObjectPolygon(object)));
    if (blocker) warnings.push({ id: `fridge-${fridge.id}-${blocker.id}`, objectIds: [fridge.id, blocker.id], kind: 'fridge-access', message: `${blocker.name}이(가) 냉장고 전면 접근 공간을 막고 있습니다.` });
  }
  const monitor = furniture.find((object) => object.type === 'monitor');
  if (monitor) {
    const sight = rotatedObjectPolygon(zone(monitor, 1000, monitor.width, 1800, true));
    const blocker = furniture.find((object) => !['monitor', 'meeting-table', 'meeting-chair'].includes(object.type) && polygonsOverlap(sight, rotatedObjectPolygon(object)));
    if (blocker) warnings.push({ id: `monitor-${monitor.id}-${blocker.id}`, objectIds: [monitor.id, blocker.id], kind: 'monitor-sight', message: `${blocker.name}이(가) 대형 모니터 전면 시야를 가리고 있습니다.` });
  }

  return warnings;
}

export function getProjectLayoutWarnings(project: LayoutProject): LayoutWarning[] {
  const roomBoundaryClosed = isRoomBoundaryClosed(
    project.room.vertices,
    project.room.removedWallIndices ?? [],
    project.objects.filter((object) => object.type === 'wall').map((wall) => ({
      ...getWallEndpoints(wall),
      thickness: wall.depth,
    })),
  );
  return getLayoutWarnings(
    project.objects,
    project.room.vertices,
    project.settings.minimumAisleWidth,
    getClosedWallLoops(project.objects),
    roomBoundaryClosed,
  );
}
