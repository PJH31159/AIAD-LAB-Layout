import type { LayoutObject, LayoutObjectType, Point } from '../types/layout';
import { WALL_SNAP_STEP, WALL_THICKNESS } from '../data/layoutConstants';
import { alignObjectPosition, type AlignmentGuides } from './alignment';
import { rotatedBounds } from './coordinates';
import { normalizeRotation, snapToGrid } from './snapping';

export const wallMountedTypes = new Set<LayoutObjectType>([
  'door',
  'window',
  'outlet',
  'lan-port',
]);

export const furnitureWallSnapTypes = new Set<LayoutObjectType>([
  'desk',
  'cabinet',
  'shelf',
  'partition',
]);

export const FURNITURE_WALL_SNAP_DISTANCE = 50;

export type FurnitureWallSnapCandidate = {
  x: number;
  y: number;
  distance: number;
  wallStart: Point;
  wallEnd: Point;
  inward: Point;
};

export type FurnitureDragResolution = {
  x: number;
  y: number;
  guides: AlignmentGuides;
  wallCandidate: FurnitureWallSnapCandidate | null;
};

export type WallSnapSurface = {
  start: Point;
  end: Point;
  inward: Point;
  sourceId: string;
  thickness: number;
};

function projectToSegment(point: Point, start: Point, end: Point, halfLength = 0) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const raw = lengthSquared === 0 ? 0 : ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const length = Math.sqrt(lengthSquared);
  const insetRatio = length > halfLength * 2 ? halfLength / length : 0.5;
  const ratio = Math.max(insetRatio, Math.min(1 - insetRatio, raw));
  const projected = { x: start.x + dx * ratio, y: start.y + dy * ratio };
  return {
    point: projected,
    distance: Math.hypot(point.x - projected.x, point.y - projected.y),
    rotation: normalizeRotation((Math.atan2(dy, dx) * 180) / Math.PI),
  };
}

export function getRoomWallSnapSurfaces(
  vertices: Point[],
  excludedWallIndices: number[] = [],
  wallThicknesses?: number[],
): WallSnapSurface[] {
  const clockwiseOnScreen = signedPolygonArea(vertices) >= 0;
  return vertices.flatMap((start, index) => {
    if (excludedWallIndices.includes(index)) return [];
    const end = vertices[(index + 1) % vertices.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return [];
    const leftNormal = { x: -dy / length, y: dx / length };
    return [{
      start,
      end,
      inward: clockwiseOnScreen ? leftNormal : { x: -leftNormal.x, y: -leftNormal.y },
      sourceId: `room-wall-${index}`,
      thickness: wallThicknesses?.[index] ?? WALL_THICKNESS,
    }];
  });
}

export function getObjectWallSnapSurface(wall: LayoutObject): WallSnapSurface | null {
  if (wall.type !== 'wall' && wall.type !== 'glass-wall') return null;
  const endpoints = wall.type === 'wall' ? getWallEndpoints(wall) : (() => {
    const radians = wall.rotation * Math.PI / 180;
    const center = { x: wall.x + wall.width / 2, y: wall.y + wall.depth / 2 };
    return {
      start: { x: center.x - Math.cos(radians) * wall.width / 2, y: center.y - Math.sin(radians) * wall.width / 2 },
      end: { x: center.x + Math.cos(radians) * wall.width / 2, y: center.y + Math.sin(radians) * wall.width / 2 },
    };
  })();
  const { start, end } = endpoints;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const thicknessSide = wall.wallSide ?? 1;
  const outward = { x: (-dy / length) * thicknessSide, y: (dx / length) * thicknessSide };
  const inward = { x: -outward.x, y: -outward.y };
  const surfaceStart = wall.type === 'glass-wall' ? { x: start.x + inward.x * wall.depth / 2, y: start.y + inward.y * wall.depth / 2 } : start;
  const surfaceEnd = wall.type === 'glass-wall' ? { x: end.x + inward.x * wall.depth / 2, y: end.y + inward.y * wall.depth / 2 } : end;
  return { start: surfaceStart, end: surfaceEnd, inward, sourceId: wall.id, thickness: wall.depth };
}

export function getObjectWallSnapSurfaces(objects: LayoutObject[], excludedId?: string): WallSnapSurface[] {
  return objects.flatMap((object) => {
    if (object.id === excludedId) return [];
    const surface = getObjectWallSnapSurface(object);
    return surface ? [surface] : [];
  });
}

export function snapObjectToWallSurfaces(
  object: Pick<LayoutObject, 'x' | 'y' | 'width' | 'depth' | 'rotation'> & { type?: LayoutObjectType },
  surfaces: WallSnapSurface[],
) {
  const center = { x: object.x + object.width / 2, y: object.y + object.depth / 2 };
  const candidates = surfaces.map(({ start, end, inward, sourceId, thickness }) => {
    const projected = projectToSegment(center, start, end, object.width / 2);
    const mountedDepth = object.type === 'door' || object.type === 'window' ? thickness : object.depth;
    const mountedCenter = {
      x: projected.point.x - inward.x * mountedDepth / 2,
      y: projected.point.y - inward.y * mountedDepth / 2,
    };
    return {
      ...projected,
      point: mountedCenter,
      distance: Math.hypot(center.x - mountedCenter.x, center.y - mountedCenter.y),
      sourceId,
      mountedDepth,
    };
  });
  if (candidates.length === 0) return { x: object.x, y: object.y, rotation: object.rotation };
  const nearest = candidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
  return {
    x: nearest.point.x - object.width / 2,
    y: nearest.point.y - nearest.mountedDepth / 2,
    rotation: nearest.rotation,
    ...(object.type === 'door' || object.type === 'window'
      ? { depth: nearest.mountedDepth, wallAttachmentId: nearest.sourceId }
      : {}),
  };
}

export function snapObjectToRoomBoundary(
  object: Pick<LayoutObject, 'x' | 'y' | 'width' | 'depth' | 'rotation'>,
  vertices: Point[],
  excludedWallIndices: number[] = [],
) {
  return snapObjectToWallSurfaces(object, getRoomWallSnapSurfaces(vertices, excludedWallIndices));
}

export function roomInteriorSwingSign(vertices: Point[]) {
  return signedPolygonArea(vertices) >= 0 ? 1 : -1;
}

function rotatedCorners(object: Pick<LayoutObject, 'x' | 'y' | 'width' | 'depth' | 'rotation'>): Point[] {
  const center = { x: object.x + object.width / 2, y: object.y + object.depth / 2 };
  const radians = (object.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    { x: -object.width / 2, y: -object.depth / 2 },
    { x: object.width / 2, y: -object.depth / 2 },
    { x: object.width / 2, y: object.depth / 2 },
    { x: -object.width / 2, y: object.depth / 2 },
  ].map((point) => ({
    x: center.x + point.x * cos - point.y * sin,
    y: center.y + point.x * sin + point.y * cos,
  }));
}

function signedPolygonArea(vertices: Point[]) {
  return vertices.reduce((area, point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

export function getFurnitureWallSnapCandidates(
  object: Pick<LayoutObject, 'x' | 'y' | 'width' | 'depth' | 'rotation'>,
  vertices: Point[],
  threshold = FURNITURE_WALL_SNAP_DISTANCE,
  excludedWallIndices: number[] = [],
  supplementalSurfaces: WallSnapSurface[] = [],
): FurnitureWallSnapCandidate[] {
  const corners = rotatedCorners(object);
  const candidates: FurnitureWallSnapCandidate[] = [];

  [...getRoomWallSnapSurfaces(vertices, excludedWallIndices), ...supplementalSurfaces].forEach(({ start: wallStart, end: wallEnd, inward }) => {
    const dx = wallEnd.x - wallStart.x;
    const dy = wallEnd.y - wallStart.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const tangent = { x: dx / length, y: dy / length };
    const projections = corners.map((corner) =>
      (corner.x - wallStart.x) * tangent.x + (corner.y - wallStart.y) * tangent.y,
    );
    if (Math.max(...projections) < 0 || Math.min(...projections) > length) return;
    const clearances = corners.map((corner) =>
      (corner.x - wallStart.x) * inward.x + (corner.y - wallStart.y) * inward.y,
    );
    const clearance = Math.min(...clearances);
    const distance = Math.abs(clearance);
    if (distance > threshold) return;
    candidates.push({
      x: object.x - clearance * inward.x,
      y: object.y - clearance * inward.y,
      distance,
      wallStart,
      wallEnd,
      inward,
    });
  });

  return candidates.sort((first, second) => first.distance - second.distance);
}

export function getFurnitureWallSnapCandidate(
  object: Pick<LayoutObject, 'x' | 'y' | 'width' | 'depth' | 'rotation'>,
  vertices: Point[],
  threshold = FURNITURE_WALL_SNAP_DISTANCE,
  excludedWallIndices: number[] = [],
  supplementalSurfaces: WallSnapSurface[] = [],
): FurnitureWallSnapCandidate | null {
  return getFurnitureWallSnapCandidates(object, vertices, threshold, excludedWallIndices, supplementalSurfaces)[0] ?? null;
}

export function resolveFurnitureDragPosition(
  object: LayoutObject,
  rawX: number,
  rawY: number,
  others: LayoutObject[],
  options: {
    roomVertices: Point[];
    excludedWallIndices?: number[];
    gridSize: number;
    snapEnabled: boolean;
    wallSnapEnabled: boolean;
    alignmentThreshold: number;
    maximumColumnPerpendicularGap?: number;
    supplementalWallSurfaces?: WallSnapSurface[];
  },
): FurnitureDragResolution {
  const proposedWallCandidates = options.wallSnapEnabled
    ? getFurnitureWallSnapCandidates(
      { ...object, x: rawX, y: rawY },
      options.roomVertices,
      FURNITURE_WALL_SNAP_DISTANCE,
      options.excludedWallIndices,
      options.supplementalWallSurfaces,
    )
    : [];
  const compatibleWallCandidates = proposedWallCandidates.reduce<FurnitureWallSnapCandidate[]>((selected, candidate) => {
    if (selected.length >= 2) return selected;
    const compatible = selected.every((current) =>
      Math.abs(current.inward.x * candidate.inward.x + current.inward.y * candidate.inward.y) <= 0.25);
    return compatible ? [...selected, candidate] : selected;
  }, []);
  const combinedWallCandidate = compatibleWallCandidates.length > 0
    ? (() => {
      const representative = compatibleWallCandidates.reduce((best, candidate) =>
        candidate.distance > best.distance ? candidate : best);
      const offset = compatibleWallCandidates.reduce((total, candidate) => ({
        x: total.x + candidate.x - rawX,
        y: total.y + candidate.y - rawY,
      }), { x: 0, y: 0 });
      return {
        ...representative,
        x: rawX + offset.x,
        y: rawY + offset.y,
        distance: Math.hypot(offset.x, offset.y),
      };
    })()
    : null;
  const wallCandidate = combinedWallCandidate && !others.some((other) => {
    if (other.type !== 'column') return false;
    const furnitureBounds = rotatedBounds({ ...object, x: combinedWallCandidate.x, y: combinedWallCandidate.y });
    const columnBounds = rotatedBounds(other);
    return furnitureBounds.left < columnBounds.right
      && furnitureBounds.right > columnBounds.left
      && furnitureBounds.top < columnBounds.bottom
      && furnitureBounds.bottom > columnBounds.top;
  })
    ? combinedWallCandidate
    : null;

  if (wallCandidate) {
    return {
      x: wallCandidate.x,
      y: wallCandidate.y,
      guides: {},
      wallCandidate,
    };
  }

  const gridX = snapToGrid(rawX, options.gridSize, options.snapEnabled);
  const gridY = snapToGrid(rawY, options.gridSize, options.snapEnabled);
  const aligned = alignObjectPosition(
    object,
    gridX,
    gridY,
    others,
    options.alignmentThreshold,
    (other) => other.type === 'column'
      ? options.maximumColumnPerpendicularGap ?? 500
      : Number.POSITIVE_INFINITY,
  );
  return { ...aligned, wallCandidate: null };
}

type WallGeometryInput = Pick<LayoutObject, 'x' | 'y' | 'width' | 'depth' | 'rotation' | 'wallSide'>;

export function getWallEndpoints(wall: WallGeometryInput): { start: Point; end: Point } {
  const rad = (wall.rotation * Math.PI) / 180;
  const center = {
    x: wall.x + wall.width / 2,
    y: wall.y + wall.depth / 2,
  };
  const halfLength = wall.width / 2;
  const side = wall.wallSide ?? 1;
  const normal = { x: -Math.sin(rad), y: Math.cos(rad) };
  const faceCenter = {
    x: center.x - normal.x * wall.depth / 2 * side,
    y: center.y - normal.y * wall.depth / 2 * side,
  };
  const start = {
    x: faceCenter.x - halfLength * Math.cos(rad),
    y: faceCenter.y - halfLength * Math.sin(rad),
  };
  const end = {
    x: faceCenter.x + halfLength * Math.cos(rad),
    y: faceCenter.y + halfLength * Math.sin(rad),
  };
  return { start, end };
}

export function getLinearWallEndpoints(wall: LayoutObject): { start: Point; end: Point } {
  if (wall.type === 'wall') return getWallEndpoints(wall);
  const radians = wall.rotation * Math.PI / 180;
  const center = { x: wall.x + wall.width / 2, y: wall.y + wall.depth / 2 };
  return {
    start: { x: center.x - Math.cos(radians) * wall.width / 2, y: center.y - Math.sin(radians) * wall.width / 2 },
    end: { x: center.x + Math.cos(radians) * wall.width / 2, y: center.y + Math.sin(radians) * wall.width / 2 },
  };
}

export function linearWallFromEndpoints(wall: LayoutObject, start: Point, end: Point): Partial<LayoutObject> {
  if (wall.type === 'wall') return wallFromEndpoints(start, end, wall.depth, wall.wallSide ?? -1);
  const snappedStart = { x: snapToGrid(start.x, WALL_SNAP_STEP, true), y: snapToGrid(start.y, WALL_SNAP_STEP, true) };
  const snappedEnd = { x: snapToGrid(end.x, WALL_SNAP_STEP, true), y: snapToGrid(end.y, WALL_SNAP_STEP, true) };
  const width = Math.max(WALL_THICKNESS, Math.hypot(snappedEnd.x - snappedStart.x, snappedEnd.y - snappedStart.y));
  const depth = Math.max(50, Math.min(500, Math.round(wall.depth / 10) * 10));
  return {
    x: (snappedStart.x + snappedEnd.x) / 2 - width / 2,
    y: (snappedStart.y + snappedEnd.y) / 2 - depth / 2,
    width,
    depth,
    rotation: normalizeRotation(Math.atan2(snappedEnd.y - snappedStart.y, snappedEnd.x - snappedStart.x) * 180 / Math.PI),
  };
}

export function wallFromEndpoints(
  start: Point,
  end: Point,
  depth: number,
  wallSide: 1 | -1 = 1,
): Pick<LayoutObject, 'x' | 'y' | 'width' | 'depth' | 'rotation' | 'wallSide'> {
  const snappedStart = {
    x: snapToGrid(start.x, WALL_SNAP_STEP, true),
    y: snapToGrid(start.y, WALL_SNAP_STEP, true),
  };
  const snappedEnd = {
    x: snapToGrid(end.x, WALL_SNAP_STEP, true),
    y: snapToGrid(end.y, WALL_SNAP_STEP, true),
  };
  const dx = snappedEnd.x - snappedStart.x;
  const dy = snappedEnd.y - snappedStart.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const gridEnd = horizontal
    ? { x: dx === 0 ? snappedStart.x + WALL_THICKNESS : snappedEnd.x, y: snappedStart.y }
    : { x: snappedStart.x, y: dy === 0 ? snappedStart.y + WALL_THICKNESS : snappedEnd.y };
  const normalizedDepth = Math.max(50, Math.min(500, Math.round(depth / 10) * 10));
  const width = Math.max(WALL_THICKNESS, Math.hypot(gridEnd.x - snappedStart.x, gridEnd.y - snappedStart.y));
  const degrees = (Math.atan2(gridEnd.y - snappedStart.y, gridEnd.x - snappedStart.x) * 180) / Math.PI;
  const faceCenter = {
    x: (snappedStart.x + gridEnd.x) / 2,
    y: (snappedStart.y + gridEnd.y) / 2,
  };
  const radians = degrees * Math.PI / 180;
  const normal = { x: -Math.sin(radians), y: Math.cos(radians) };
  const center = {
    x: faceCenter.x + normal.x * normalizedDepth / 2 * wallSide,
    y: faceCenter.y + normal.y * normalizedDepth / 2 * wallSide,
  };
  return {
    x: center.x - width / 2,
    y: center.y - normalizedDepth / 2,
    width,
    depth: normalizedDepth,
    rotation: ((degrees % 360) + 360) % 360,
    wallSide,
  };
}

export function inferWallSideFromRoom(wall: WallGeometryInput, vertices: Point[]): 1 | -1 {
  if (vertices.length < 2) return 1;
  const pointToSegmentDistance = (point: Point, start: Point, end: Point) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio));
  };
  const score = (wallSide: 1 | -1) => {
    const face = getWallEndpoints({ ...wall, wallSide });
    return vertices.reduce((best, start, index) => {
      const end = vertices[(index + 1) % vertices.length];
      return Math.min(best,
        pointToSegmentDistance(face.start, start, end)
        + pointToSegmentDistance(face.end, start, end));
    }, Number.POSITIVE_INFINITY);
  };
  return score(-1) + 0.001 < score(1) ? -1 : 1;
}

export function snapWallSurfaceToGrid<T extends WallGeometryInput>(
  wall: T,
  gridSize: number,
  enabled = true,
  orthogonalEnabled = true,
): T {
  const rotation = orthogonalEnabled
    ? normalizeRotation(Math.round(normalizeRotation(wall.rotation) / 90) * 90)
    : normalizeRotation(wall.rotation);
  const step = enabled ? Math.max(WALL_SNAP_STEP, gridSize) : WALL_SNAP_STEP;
  const width = Math.max(WALL_THICKNESS, snapToGrid(wall.width, WALL_SNAP_STEP, true));
  const face = getWallEndpoints({ ...wall, width, rotation });
  const start = {
    x: snapToGrid(face.start.x, step, enabled),
    y: snapToGrid(face.start.y, step, enabled),
  };
  const radians = rotation * Math.PI / 180;
  const end = {
    x: start.x + Math.cos(radians) * width,
    y: start.y + Math.sin(radians) * width,
  };
  return {
    ...wall,
    ...wallFromEndpoints(start, end, wall.depth, wall.wallSide ?? 1),
  };
}
