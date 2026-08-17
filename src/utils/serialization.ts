import { catalogByType } from '../data/objectCatalog';
import { GRID_SIZE, WALL_SNAP_STEP, WALL_THICKNESS } from '../data/layoutConstants';
import type {
  LayoutObject,
  LayoutObjectType,
  LayoutProject,
  LayoutSettings,
  LayoutSpace,
  Point,
} from '../types/layout';
import {
  getObjectWallSnapSurfaces,
  getRoomWallSnapSurfaces,
  inferWallSideFromRoom,
  snapObjectToWallSurfaces,
  snapWallSurfaceToGrid,
  wallMountedTypes,
} from './structurePlacement';
import { isValidRoomPolygon, normalizeRoomWallThicknesses } from './roomGeometry';
import { snapToGrid } from './snapping';

export const STORAGE_KEY = 'aiad-lab-layout-v4';
export const LEGACY_STORAGE_KEY = 'aiad-lab-layout-v3';
export const PROJECT_LIBRARY_KEY = 'aiad-lab-layout-project-library-v1';

export type StoredProjectEntry = {
  id: string;
  savedAt: string;
  project: LayoutProject;
};

const legacyTypeMap: Record<string, LayoutObjectType> = {
  gradDesk: 'desk',
  underDesk: 'desk',
  profLarge: 'desk',
  profSmall: 'desk',
  gradChair: 'chair',
  underChair: 'chair',
  meetingChair: 'meeting-chair',
  'meeting-chair': 'meeting-chair',
  meetingTable: 'meeting-table',
  existingDesk: 'existing-desk',
  'existing-desk': 'existing-desk',
  monitor: 'monitor',
  sofa: 'sofa',
  fridge: 'fridge',
  printer: 'printer',
  whiteboard: 'whiteboard',
  ac: 'ac',
  distribution: 'distribution',
  outlet: 'outlet',
  lan: 'lan-port',
  'lan-port': 'lan-port',
  cabinet: 'cabinet',
  shelf: 'shelf',
  glassWall: 'glass-wall',
  glass: 'glass-wall',
  'glass-wall': 'glass-wall',
  door: 'door',
  column: 'column',
  window: 'window',
};

const defaultSettings: LayoutSettings = {
  unit: 'mm',
  gridSize: 100,
  snapEnabled: true,
  objectSnapEnabled: true,
  orthogonalSnapEnabled: true,
  minimumAisleWidth: 900,
  showGrid: true,
  showLabels: true,
  showDimensions: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function point(value: unknown, factor = 1): Point | null {
  if (!isRecord(value)) return null;
  const x = finite(value.x, Number.NaN);
  const y = finite(value.y, Number.NaN);
  return Number.isFinite(x) && Number.isFinite(y) ? { x: x * factor, y: y * factor } : null;
}

function isObjectType(value: unknown): value is LayoutObjectType {
  return typeof value === 'string' && value in catalogByType;
}

function validateCurrentProject(data: Record<string, unknown>) {
  if (!isRecord(data.room)) throw new Error('현재 프로젝트의 연구실 외곽 정보가 없습니다.');
  const room = data.room;
  const vertices = room.vertices;
  if (!Array.isArray(vertices)) throw new Error('현재 프로젝트의 연구실 외곽 정보가 없습니다.');
  if (vertices.some((value: unknown) => !isRecord(value) || typeof value.x !== 'number' || !Number.isFinite(value.x) || typeof value.y !== 'number' || !Number.isFinite(value.y))) {
    throw new Error('현재 프로젝트의 외곽 좌표가 올바르지 않습니다.');
  }
  if (!Array.isArray(data.objects)) throw new Error('현재 프로젝트의 객체 목록이 없습니다.');
  const ids = new Set<string>();
  data.objects.forEach((value) => {
    if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim() || !isObjectType(value.type)) throw new Error('현재 프로젝트에 지원하지 않는 객체가 있습니다.');
    if (ids.has(value.id)) throw new Error(`중복된 객체 ID가 있습니다: ${value.id}.`);
    ids.add(value.id);
    const numbers = [value.x, value.y, value.width, value.depth, value.rotation];
    if (numbers.some((number) => typeof number !== 'number' || !Number.isFinite(number)) || (value.width as number) < 50 || (value.depth as number) < 50) {
      throw new Error(`객체 좌표 또는 크기가 올바르지 않습니다: ${value.id}.`);
    }
  });
  const validateWallIndices = (value: unknown) => value === undefined || (Array.isArray(value) && value.every((index) => typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < vertices.length));
  if (!validateWallIndices(room.lockedWallIndices) || !validateWallIndices(room.removedWallIndices)) throw new Error('외곽벽 인덱스가 올바르지 않습니다.');
  if (room.wallThicknesses !== undefined && (!Array.isArray(room.wallThicknesses) || room.wallThicknesses.length !== vertices.length || room.wallThicknesses.some((value) => typeof value !== 'number' || !Number.isFinite(value)))) {
    throw new Error('외곽벽 두께 정보가 올바르지 않습니다.');
  }
}

function normalizeObject(value: unknown, index: number, factor = 1, preserveWallLength = false): LayoutObject | null {
  if (!isRecord(value)) return null;
  const rawType = value.type;
  const type = isObjectType(rawType)
    ? rawType
    : typeof rawType === 'string'
      ? legacyTypeMap[rawType]
      : undefined;
  if (!type) return null;
  const catalog = catalogByType[type];
  const rawWidth = finite(value.width ?? value.w, catalog.width / factor) * factor;
  const rawDepth = finite(value.depth ?? value.h, catalog.depth / factor) * factor;
  const width = type === 'wall' && !preserveWallLength ? Math.max(WALL_THICKNESS, snapToGrid(rawWidth, WALL_SNAP_STEP, true)) : rawWidth;
  const depth = rawDepth;
  return {
    id: text(value.id, `${type}-${index}-${Date.now()}`),
    type,
    name: text(value.name, catalog.label),
    x: finite(value.x, 0) * factor,
    y: finite(value.y, 0) * factor,
    width: Math.max(50, width),
    depth: Math.max(50, depth),
    rotation: ((finite(value.rotation, 0) % 360) + 360) % 360,
    locked: Boolean(value.locked),
    ...(typeof value.color === 'string' ? { color: value.color } : {}),
    ...(typeof value.height === 'number' ? { height: value.height * factor, heightSource: value.heightSource === 'catalog' ? 'catalog' as const : 'measured' as const } : catalog.height ? { height: catalog.height, heightSource: 'catalog' as const } : {}),
    ...(typeof value.seats === 'number' ? { seats: value.seats } : catalog.seats ? { seats: catalog.seats } : {}),
    ...(typeof value.spaceId === 'string' ? { spaceId: value.spaceId } : typeof value.space === 'string' ? { spaceId: value.space } : {}),
    ...(typeof value.groupId === 'string' ? { groupId: value.groupId } : {}),
    ...(typeof value.wallAttachmentId === 'string' ? { wallAttachmentId: value.wallAttachmentId } : {}),
    ...(typeof value.opacity === 'number' ? { opacity: Math.max(0, Math.min(1, value.opacity)) } : {}),
    ...(type === 'wall' && (value.wallSide === -1 || value.wallSide === 1)
      ? { wallSide: value.wallSide as 1 | -1 }
      : {}),
    ...(type === 'door' ? {
      doorHinge: value.doorHinge === 'right' ? 'right' as const : 'left' as const,
      doorSwing: value.doorSwing === 'outward' ? 'outward' as const : 'inward' as const,
      doorOpeningAngle: Math.max(10, Math.min(180, finite(value.doorOpeningAngle ?? value.openingAngle, 90))),
    } : {}),
  };
}

function normalizeV3(data: Record<string, unknown>): LayoutProject {
  const preserveCurrentPlacement = data.version === 4;
  if (!isRecord(data.room) || !Array.isArray(data.room.vertices)) {
    throw new Error('연구실 외곽 정보가 없습니다.');
  }
  const vertices = data.room.vertices
    .map((value) => point(value))
    .filter((value): value is Point => value !== null)
    .map((value) => preserveCurrentPlacement ? value : ({
      x: snapToGrid(value.x, WALL_SNAP_STEP, true),
      y: snapToGrid(value.y, WALL_SNAP_STEP, true),
    }));
  if (vertices.length < 3) throw new Error('연구실 외곽점은 3개 이상이어야 합니다.');
  if (!isValidRoomPolygon(vertices, 1)) throw new Error('연구실 외곽선이 교차하거나 너무 짧은 구간이 있습니다.');
  const removedWallIndices = Array.isArray(data.room.removedWallIndices)
    ? data.room.removedWallIndices.filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < vertices.length)
    : [];
  const wallThicknesses = normalizeRoomWallThicknesses(
    vertices,
    Array.isArray(data.room.wallThicknesses)
      ? data.room.wallThicknesses.map((value) => finite(value, WALL_THICKNESS))
      : undefined,
  );
  const spaces: LayoutSpace[] = Array.isArray(data.room.spaces) ? data.room.spaces.flatMap((space, index) => {
    if (!isRecord(space) || !isRecord(space.bounds)) return [];
    return [{
      id: text(space.id, `space-${index}`),
      name: text(space.name, `공간 ${index + 1}`),
      type: space.type === 'meeting' || space.type === 'common' || space.type === 'custom' ? space.type : 'workspace' as const,
      bounds: {
        x: finite(space.bounds.x, 0), y: finite(space.bounds.y, 0),
        width: finite(space.bounds.width ?? space.bounds.w, 0), depth: finite(space.bounds.depth ?? space.bounds.h, 0),
      },
    }];
  }) : [];

  const normalizedObjects = Array.isArray(data.objects)
    ? data.objects
        .map((value, index) => normalizeObject(value, index, 1, preserveCurrentPlacement))
        .filter((value): value is LayoutObject => value !== null)
        .map((object) => object.type === 'wall' && object.wallSide === undefined
          ? { ...object, wallSide: inferWallSideFromRoom(object, vertices) }
          : object)
        .map((object) => !preserveCurrentPlacement && object.type === 'wall'
          ? snapWallSurfaceToGrid(object, GRID_SIZE, true)
          : object)
    : [];
  const wallSurfaces = [
    ...getRoomWallSnapSurfaces(vertices, removedWallIndices, wallThicknesses),
    ...getObjectWallSnapSurfaces(normalizedObjects),
  ];
  const snappedObjects = normalizedObjects.map((object) => !preserveCurrentPlacement && wallMountedTypes.has(object.type)
    ? { ...object, ...snapObjectToWallSurfaces(object, wallSurfaces) }
    : object);
  const objects = snappedObjects.map((object) => {
    const matched = object.spaceId ? spaces.find((space) => space.id === object.spaceId) : undefined;
    const center = { x: object.x + object.width / 2, y: object.y + object.depth / 2 };
    const containing = spaces.find((space) => center.x >= space.bounds.x && center.x <= space.bounds.x + space.bounds.width && center.y >= space.bounds.y && center.y <= space.bounds.y + space.bounds.depth);
    const spaceId = matched?.id ?? containing?.id;
    return spaceId ? { ...object, spaceId } : { ...object, spaceId: undefined };
  });
  const settings = isRecord(data.settings) ? data.settings : {};
  return {
    version: 4,
    projectName: text(data.projectName, '가져온 연구실 배치'),
    room: {
      name: text(data.room.name, '연구실'),
      vertices,
      lockedWallIndices: Array.isArray(data.room.lockedWallIndices)
        ? data.room.lockedWallIndices.filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < vertices.length)
        : [],
      removedWallIndices,
      wallThicknesses,
      ...(typeof data.room.officialId === 'string' ? { officialId: data.room.officialId } : {}),
      ...(typeof data.room.officialRevision === 'number' ? { officialRevision: data.room.officialRevision } : {}),
      ...(typeof data.room.wallHeight === 'number' ? { wallHeight: data.room.wallHeight } : {}),
      ...(spaces.length ? { spaces } : {}),
      ...(Array.isArray(data.room.dimensions) ? { dimensions: data.room.dimensions.flatMap((dimension, index) => {
        if (!isRecord(dimension)) return [];
        const start = point(dimension.start);
        const end = point(dimension.end);
        if (!start || !end) return [];
        return [{
          id: text(dimension.id, `dimension-${index}`),
          start,
          end,
          ...(typeof dimension.label === 'string' ? { label: dimension.label } : {}),
          ...(typeof dimension.offset === 'number' ? { offset: dimension.offset } : {}),
          ...(typeof dimension.labelOffsetX === 'number' ? { labelOffsetX: dimension.labelOffsetX } : {}),
          ...(typeof dimension.labelOffsetY === 'number' ? { labelOffsetY: dimension.labelOffsetY } : {}),
        }];
      }) } : {}),
    },
    objects,
    settings: {
      unit: settings.unit === 'cm' || settings.unit === 'm' ? settings.unit : 'mm',
      gridSize: Math.max(10, finite(settings.gridSize, defaultSettings.gridSize)),
      snapEnabled: settings.snapEnabled !== false,
      objectSnapEnabled: settings.objectSnapEnabled !== false,
      orthogonalSnapEnabled: settings.orthogonalSnapEnabled !== false,
      minimumAisleWidth: Math.max(
        0,
        finite(settings.minimumAisleWidth, defaultSettings.minimumAisleWidth),
      ),
      showGrid: settings.showGrid !== false,
      showLabels: settings.showLabels !== false,
      showDimensions: settings.showDimensions !== false,
      autoSaveInterval: Math.max(0, finite(settings.autoSaveInterval, 3)),
    },
    orientation: isRecord(data.orientation) ? {
      rotationDegrees: finite(data.orientation.rotationDegrees, 0),
      label: text(data.orientation.label, '가져온 도면 방향'),
    } : { rotationDegrees: 0, label: '가져온 도면 방향' },
    updatedAt: text(data.updatedAt, new Date().toISOString()),
  };
}

function legacySegmentToObject(value: unknown, index: number): LayoutObject | null {
  if (!isRecord(value)) return null;
  const start = point(value.start, 10);
  const end = point(value.end, 10);
  if (!start || !end) return null;
  const width = Math.hypot(end.x - start.x, end.y - start.y);
  const depth = Math.max(50, finite(value.thickness, 10) * 10);
  return {
    id: text(value.id, `glass-wall-${index}`),
    type: 'glass-wall',
    name: text(value.name, '유리벽'),
    x: (start.x + end.x) / 2 - width / 2,
    y: (start.y + end.y) / 2 - depth / 2,
    width,
    depth,
    rotation: (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI,
    locked: Boolean(value.locked),
  };
}

function normalizeLegacyV2(data: Record<string, unknown>): LayoutProject {
  const boundary = isRecord(data.roomBoundary) ? data.roomBoundary : null;
  if (!boundary || !Array.isArray(boundary.vertices)) {
    throw new Error('구형 파일의 연구실 외곽 정보를 찾을 수 없습니다.');
  }
  const vertices = boundary.vertices
    .map((value) => point(value, 10))
    .filter((value): value is Point => value !== null)
    .map((value) => ({
      x: snapToGrid(value.x, WALL_SNAP_STEP, true),
      y: snapToGrid(value.y, WALL_SNAP_STEP, true),
    }));
  if (vertices.length < 3) throw new Error('구형 파일의 외곽점이 올바르지 않습니다.');

  const objectSources = [data.furniture, data.structures, data.doors, data.windows]
    .filter(Array.isArray)
    .flat() as unknown[];
  const objects = objectSources
    .map((value, index) => normalizeObject(value, index, 10))
    .filter((value): value is LayoutObject => value !== null);
  const partitions = Array.isArray(data.glassWalls)
    ? data.glassWalls
        .map(legacySegmentToObject)
        .filter((value): value is LayoutObject => value !== null)
    : [];
  const oldSettings = isRecord(data.settings) ? data.settings : {};

  return {
    version: 4,
    projectName: text(data.projectName, '가져온 v2 배치'),
    room: { name: '연구실', vertices, wallThicknesses: normalizeRoomWallThicknesses(vertices, undefined) },
    objects: [...objects, ...partitions],
    settings: {
      ...defaultSettings,
      gridSize: GRID_SIZE,
      snapEnabled: oldSettings.snap !== false,
      minimumAisleWidth: Math.max(0, finite(oldSettings.minAisleWidth, 90) * 10),
      showGrid: oldSettings.showGrid !== false,
      showDimensions: oldSettings.showDimensions !== false,
    },
    orientation: { rotationDegrees: 0, label: '가져온 구형 도면 방향' },
    updatedAt: new Date().toISOString(),
  };
}

function projectMainLineObject(value: unknown, index: number, fallbackType: LayoutObjectType): LayoutObject | null {
  if (!isRecord(value)) return null;
  const start = point(value.start ?? value.startPoint, 10);
  const end = point(value.end ?? value.endPoint, 10);
  if (!start || !end) return null;
  const mapped = typeof value.type === 'string' ? legacyTypeMap[value.type] : undefined;
  const type = mapped ?? fallbackType;
  const width = Math.hypot(end.x - start.x, end.y - start.y);
  const depth = Math.max(50, finite(value.thickness, type === 'wall' ? 10 : 8) * 10);
  return {
    id: text(value.id, `${type}-${index}`), type,
    name: text(value.name ?? value.label, catalogByType[type].label),
    x: (start.x + end.x) / 2 - width / 2,
    y: (start.y + end.y) / 2 - depth / 2,
    width, depth,
    rotation: (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI,
    locked: Boolean(value.locked),
    ...(typeof value.color === 'string' ? { color: value.color } : {}),
    ...(typeof value.opacity === 'number' ? { opacity: Math.max(0, Math.min(1, value.opacity)) } : {}),
  };
}

function projectMainCenteredObject(value: unknown, index: number): LayoutObject | null {
  if (!isRecord(value)) return null;
  const mapped = typeof value.type === 'string' ? legacyTypeMap[value.type] : undefined;
  if (!mapped) return null;
  const catalog = catalogByType[mapped];
  const width = finite(value.w ?? value.width, catalog.width / 10) * 10;
  const depth = finite(value.h ?? value.height, catalog.depth / 10) * 10;
  const centerX = finite(value.x, 0) * 10;
  const centerY = finite(value.y, 0) * 10;
  return {
    id: text(value.id, `${mapped}-${index}`), type: mapped,
    name: text(value.name ?? value.label, catalog.label),
    x: centerX - width / 2, y: centerY - depth / 2,
    width: Math.max(50, width), depth: Math.max(50, depth),
    rotation: ((finite(value.rotation, 0) % 360) + 360) % 360,
    locked: Boolean(value.locked),
    ...(typeof value.color === 'string' ? { color: value.color } : catalog.color ? { color: catalog.color } : {}),
    ...(typeof value.seats === 'number' ? { seats: value.seats } : catalog.seats ? { seats: catalog.seats } : {}),
    ...(catalog.height ? { height: catalog.height } : {}),
    ...(typeof value.space === 'string' ? { spaceId: value.space } : {}),
    ...(typeof value.opacity === 'number' ? { opacity: Math.max(0, Math.min(1, value.opacity)) } : {}),
  };
}

function projectMainDoor(value: unknown, index: number): LayoutObject | null {
  if (!isRecord(value)) return null;
  const width = Math.max(50, finite(value.width, 90) * 10);
  const depth = Math.max(50, finite(value.thickness, 10) * 10);
  const rotation = ((finite(value.rotation, 0) % 360) + 360) % 360;
  const radians = rotation * Math.PI / 180;
  const startX = finite(value.x, 0) * 10;
  const startY = finite(value.y, 0) * 10;
  const centerX = startX + Math.cos(radians) * width / 2;
  const centerY = startY + Math.sin(radians) * width / 2;
  const opening = typeof value.openingDirection === 'string' ? value.openingDirection : '';
  return {
    id: text(value.id, `door-${index}`), type: 'door', name: text(value.name, '문'),
    x: centerX - width / 2, y: centerY - depth / 2, width, depth, rotation,
    locked: Boolean(value.locked),
    doorHinge: opening.endsWith('right') ? 'right' : 'left',
    doorSwing: opening.startsWith('outward') ? 'outward' : 'inward',
    doorOpeningAngle: Math.max(10, Math.min(180, finite(value.openingAngle, 90))),
  };
}

function normalizeProjectMainV31(data: Record<string, unknown>): LayoutProject {
  const boundary = isRecord(data.roomBoundary) && Array.isArray(data.roomBoundary.vertices)
    ? data.roomBoundary.vertices
    : isRecord(data.room) && Array.isArray(data.room.boundary) ? data.room.boundary : null;
  if (!boundary) throw new Error('project-main 외곽 정보를 찾을 수 없습니다.');
  const vertices = boundary.map((value) => point(value, 10)).filter((value): value is Point => value !== null);
  if (vertices.length < 3 || !isValidRoomPolygon(vertices, 1)) throw new Error('project-main 외곽선이 올바르지 않습니다.');

  const walls = Array.isArray(data.walls) ? data.walls.map((value, index) => projectMainLineObject(value, index, 'wall')).filter((value): value is LayoutObject => value !== null) : [];
  const glassWalls = Array.isArray(data.glassWalls) ? data.glassWalls.map((value, index) => projectMainLineObject(value, index, 'glass-wall')).filter((value): value is LayoutObject => value !== null) : [];
  const windows = Array.isArray(data.windows) ? data.windows.map((value, index) => projectMainLineObject(value, index, 'window')).filter((value): value is LayoutObject => value !== null) : [];
  const doors = Array.isArray(data.doors) ? data.doors.map(projectMainDoor).filter((value): value is LayoutObject => value !== null) : [];
  const structures = Array.isArray(data.structures) ? data.structures.map(projectMainCenteredObject).filter((value): value is LayoutObject => value !== null) : [];
  const furniture = Array.isArray(data.furniture) ? data.furniture.map(projectMainCenteredObject).filter((value): value is LayoutObject => value !== null) : [];
  const spaces = Array.isArray(data.spaces) ? data.spaces.flatMap((value, index) => {
    if (!isRecord(value) || !isRecord(value.bounds)) return [];
    return [{
      id: text(value.id, `space-${index}`), name: text(value.name, `공간 ${index + 1}`),
      type: value.type === 'common' ? 'common' as const : value.type === 'meeting' ? 'meeting' as const : 'workspace' as const,
      bounds: {
        x: finite(value.bounds.x, 0) * 10, y: finite(value.bounds.y, 0) * 10,
        width: finite(value.bounds.w ?? value.bounds.width, 0) * 10,
        depth: finite(value.bounds.h ?? value.bounds.depth, 0) * 10,
      },
    }];
  }) : [];
  const assignSpace = (object: LayoutObject): LayoutObject => {
    const raw = object.spaceId;
    const matched = raw ? spaces.find((space) => space.id === raw || space.name === raw) : undefined;
    const center = { x: object.x + object.width / 2, y: object.y + object.depth / 2 };
    const containing = spaces.find((space) => center.x >= space.bounds.x && center.x <= space.bounds.x + space.bounds.width && center.y >= space.bounds.y && center.y <= space.bounds.y + space.bounds.depth);
    const spaceId = matched?.id ?? containing?.id;
    return spaceId ? { ...object, spaceId } : { ...object, spaceId: undefined };
  };
  const settings = isRecord(data.settings) ? data.settings : {};
  return {
    version: 4,
    projectName: text(data.projectName, '가져온 project-main 배치'),
    room: {
      name: 'AIAD 연구실', vertices, spaces,
      wallThicknesses: normalizeRoomWallThicknesses(vertices, vertices.map(() => finite(settings.wallThickness ?? data.wallThickness, 10) * 10)),
      officialRevision: finite(data.officialRevision, 0),
      wallHeight: finite(settings.wallHeight, 270) * 10,
      lockedWallIndices: [], removedWallIndices: [],
    },
    objects: [...walls, ...glassWalls, ...doors, ...windows, ...structures, ...furniture].map(assignSpace),
    settings: {
      ...defaultSettings,
      gridSize: Math.max(10, finite(settings.gridSize, GRID_SIZE / 10) * 10),
      snapEnabled: settings.snap !== false,
      objectSnapEnabled: settings.objectSnap !== false,
      minimumAisleWidth: Math.max(0, finite(settings.minAisleWidth, 90) * 10),
      showGrid: settings.showGrid !== false,
      showDimensions: settings.showDimensions !== false,
    },
    orientation: isRecord(data.orientation) ? {
      rotationDegrees: finite(data.orientation.rotationDegrees, 0),
      label: text(data.orientation.label, 'project-main 도면 방향'),
    } : {
      rotationDegrees: finite(data.orientation, 0),
      label: text(data.orientationLabel, 'project-main 도면 방향'),
    },
    updatedAt: text(data.updatedAt, new Date().toISOString()),
  };
}

export function parseProject(raw: string): LayoutProject {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('JSON 문법이 올바르지 않습니다.');
  }
  if (!isRecord(data)) throw new Error('프로젝트 데이터가 객체 형식이 아닙니다.');
  if (data.version === 4) { validateCurrentProject(data); return normalizeV3(data); }
  if (data.version === 3) return normalizeV3(data);
  if (data.version === '3.1.0' || data.version === '3.1') return normalizeProjectMainV31(data);
  if (data.version === '2.0.0' || 'roomBoundary' in data) return normalizeLegacyV2(data);
  throw new Error('지원하지 않는 프로젝트 버전입니다.');
}

export function serializeProject(project: LayoutProject): string {
  return JSON.stringify(project, null, 2);
}

export function loadStoredProject(): LayoutProject | null {
  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return parseProject(raw);
  } catch {
    localStorage.setItem(`${STORAGE_KEY}-invalid-${Date.now()}`, raw);
    return null;
  }
}

export function saveStoredProject(project: LayoutProject): string {
  const savedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, serializeProject({ ...project, updatedAt: savedAt }));
  return savedAt;
}

export function loadProjectMainLegacyDraft(): LayoutProject | null {
  for (const key of ['aiad-lab-draft-v3', 'aiad-lab-layout-v2', 'aiad-lab-layout-v1']) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try { return parseProject(raw); } catch { /* try the next known legacy key */ }
  }
  return null;
}

export function loadProjectLibrary(): StoredProjectEntry[] {
  const raw = localStorage.getItem(PROJECT_LIBRARY_KEY);
  if (!raw) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values.flatMap((value) => {
      if (!isRecord(value) || typeof value.id !== 'string' || typeof value.savedAt !== 'string') return [];
      try {
        return [{
          id: value.id,
          savedAt: value.savedAt,
          project: parseProject(JSON.stringify(value.project)),
        }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function saveProjectSnapshot(project: LayoutProject): StoredProjectEntry {
  const savedAt = new Date().toISOString();
  const normalizedProject = parseProject(serializeProject({ ...project, updatedAt: savedAt }));
  const fingerprint = (value: LayoutProject) => JSON.stringify({ ...value, updatedAt: '' });
  const library = loadProjectLibrary();
  const existing = library.find((item) => fingerprint(item.project) === fingerprint(normalizedProject));
  const entry: StoredProjectEntry = {
    id: existing?.id ?? `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    savedAt,
    project: normalizedProject,
  };
  const nextLibrary = [entry, ...library.filter((item) => item.id !== entry.id)].slice(0, 30);
  localStorage.setItem(PROJECT_LIBRARY_KEY, JSON.stringify(nextLibrary));
  return entry;
}

export function deleteProjectSnapshot(id: string): StoredProjectEntry[] {
  const nextLibrary = loadProjectLibrary().filter((entry) => entry.id !== id);
  localStorage.setItem(PROJECT_LIBRARY_KEY, JSON.stringify(nextLibrary));
  return nextLibrary;
}

export function downloadText(contents: string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  window.setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 1000);
}
