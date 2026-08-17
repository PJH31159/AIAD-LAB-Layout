import { create } from 'zustand';
import { catalogByType, furnitureTypes } from '../data/objectCatalog';
import { createOfficialProject } from '../data/officialFloorplan';
import type {
  LayoutObject,
  LayoutObjectType,
  LayoutProject,
  LayoutSettings,
  Point,
} from '../types/layout';
import { loadStoredProject } from '../utils/serialization';
import { roomBounds, rotatedBounds } from '../utils/coordinates';
import { normalizeRoomWallThicknesses } from '../utils/roomGeometry';
import {
  getObjectWallSnapSurfaces,
  getObjectWallSnapSurface,
  getRoomWallSnapSurfaces,
  snapObjectToWallSurfaces,
  snapWallSurfaceToGrid,
  getWallEndpoints,
  wallFromEndpoints,
  wallMountedTypes,
} from '../utils/structurePlacement';

const snapMountedObject = (
  object: LayoutObject,
  vertices: Point[],
  removedWallIndices: number[] | undefined,
  wallThicknesses: number[] | undefined,
  objects: LayoutObject[],
) => snapObjectToWallSurfaces(object, [
  ...getRoomWallSnapSurfaces(vertices, removedWallIndices, wallThicknesses),
  ...getObjectWallSnapSurfaces(objects, object.id),
]);

const synchronizeWallDependents = (
  objects: LayoutObject[],
  vertices: Point[],
  removedWallIndices: number[] | undefined,
  wallThicknesses: number[] | undefined,
  movedWall?: LayoutObject,
) => {
  const attachedToMovedWall = new Set(movedWall ? objects.flatMap((object) => {
    if (!wallMountedTypes.has(object.type)) return [];
    const oldSurface = getObjectWallSnapSurface(movedWall);
    if (!oldSurface) return [];
    const oldPlacement = snapObjectToWallSurfaces(object, [oldSurface]);
    const attached = Math.hypot(oldPlacement.x - object.x, oldPlacement.y - object.y) < 1
      && Math.abs(oldPlacement.rotation - object.rotation) < 0.1;
    return attached ? [object.id] : [];
  }) : []);
  const normalized = objects;
  const movedSurface = movedWall
    ? getObjectWallSnapSurface(normalized.find((object) => object.id === movedWall.id) ?? movedWall)
    : null;
  return normalized.map((object) => {
    if (!wallMountedTypes.has(object.type)) return object;
    const placement = attachedToMovedWall.has(object.id) && movedSurface
      ? snapObjectToWallSurfaces(object, [movedSurface])
      : snapMountedObject(object, vertices, removedWallIndices, wallThicknesses, normalized);
    return { ...object, ...placement };
  });
};

const now = () => new Date().toISOString();
const uid = (type: LayoutObjectType) =>
  `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const withValidSpace = (object: LayoutObject, spaces: LayoutProject['room']['spaces'], requested?: string): LayoutObject => {
  if (requested !== undefined) {
    return spaces?.some((space) => space.id === requested) ? { ...object, spaceId: requested } : { ...object, spaceId: undefined };
  }
  const center = { x: object.x + object.width / 2, y: object.y + object.depth / 2 };
  const space = spaces?.find((candidate) => center.x >= candidate.bounds.x && center.x <= candidate.bounds.x + candidate.bounds.width && center.y >= candidate.bounds.y && center.y <= candidate.bounds.y + candidate.bounds.depth);
  return { ...object, spaceId: space?.id };
};

const lineRectFromEndpoints = (start: Point, end: Point, depth: number) => ({
  x: (start.x + end.x) / 2 - Math.hypot(end.x - start.x, end.y - start.y) / 2,
  y: (start.y + end.y) / 2 - depth / 2,
  width: Math.hypot(end.x - start.x, end.y - start.y),
  depth,
  rotation: Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI,
});

const getLineEndpoints = (object: LayoutObject) => object.type === 'wall'
  ? getWallEndpoints(object)
  : (() => {
      const radians = object.rotation * Math.PI / 180;
      const center = { x: object.x + object.width / 2, y: object.y + object.depth / 2 };
      const half = object.width / 2;
      return {
        start: { x: center.x - Math.cos(radians) * half, y: center.y - Math.sin(radians) * half },
        end: { x: center.x + Math.cos(radians) * half, y: center.y + Math.sin(radians) * half },
      };
    })();

export function createInitialProject(): LayoutProject {
  return createOfficialProject();
}

export function createBlankProject(width = 9000, depth = 7000): LayoutProject {
  return {
    version: 4,
    projectName: '새 연구실 배치안',
    room: {
      name: '새 연구실',
      lockedWallIndices: [],
      removedWallIndices: [],
      vertices: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: depth },
        { x: 0, y: depth },
      ],
      wallThicknesses: [100, 100, 100, 100],
    },
    objects: [],
    settings: {
      unit: 'mm',
      gridSize: 100,
      snapEnabled: true,
      objectSnapEnabled: true,
      orthogonalSnapEnabled: true,
      minimumAisleWidth: 900,
      showGrid: true,
      showLabels: true,
      showDimensions: true,
      autoSaveInterval: 3,
    },
    orientation: { rotationDegrees: 0, label: '기본 방향' },
    updatedAt: now(),
  };
}

type LayoutState = {
  project: LayoutProject;
  selectedId: string | null;
  selectedIds: string[];
  selectedRoomWallIndex: number | null;
  selectedSpaceId: string | null;
  activeTool: 'select' | 'pan' | 'measure' | 'vertices' | 'walls';
  zoom: number;
  pan: Point;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  past: LayoutProject[];
  future: LayoutProject[];
  historyFutureCheckpoint: LayoutProject[] | null;
  toast: string | null;
  lastSavedAt: string | null;
  saveStatus: 'local' | 'saving' | 'server-saving' | 'server-saved' | 'conflict' | 'offline' | 'failed';
  clipboard: LayoutObject | null;
  setProject: (project: LayoutProject, message?: string) => void;
  newProject: () => void;
  selectObject: (id: string | null, additive?: boolean) => void;
  selectAll: () => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  alignSelected: (mode: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => void;
  distributeSelected: (axis: 'horizontal' | 'vertical') => void;
  selectRoomWall: (index: number | null) => void;
  selectSpace: (id: string | null) => void;
  updateSpace: (id: string, changes: Partial<NonNullable<LayoutProject['room']['spaces']>[number]>) => void;
  setActiveTool: (tool: LayoutState['activeTool']) => void;
  addRoomVertex: (wallIndex: number, point: Point) => void;
  splitSelectedLine: () => void;
  mergeSelectedRoomWall: () => void;
  mergeSelectedWalls: () => void;
  updateRoomWallThickness: (index: number, thickness: number) => void;
  rotateProject: (degrees: -90 | 90) => void;
  resetFurniture: () => void;
  resetAll: () => void;
  toggleSelectedRoomWallLock: () => void;
  deleteSelectedRoomWall: () => void;
  addObject: (type: LayoutObjectType, position?: Point) => string;
  updateObject: (id: string, changes: Partial<LayoutObject>, record?: boolean, applyPlacementSnap?: boolean) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  pasteObject: () => void;
  toggleSelectedLock: () => void;
  updateProjectName: (name: string) => void;
  updateRoomName: (name: string) => void;
  updateRoomVertices: (vertices: Point[], record?: boolean) => void;
  updateSettings: (changes: Partial<LayoutSettings>) => void;
  beginHistory: () => void;
  commitHistory: () => void;
  cancelHistory: () => void;
  undo: () => void;
  redo: () => void;
  setView: (zoom: number, pan: Point) => void;
  setPan: (pan: Point) => void;
  setZoom: (zoom: number) => void;
  togglePanel: (side: 'left' | 'right') => void;
  setPanels: (panels: { leftCollapsed?: boolean; rightCollapsed?: boolean }) => void;
  showToast: (message: string | null) => void;
  markSaved: (time: string) => void;
  setSaveStatus: (status: LayoutState['saveStatus']) => void;
};

const stored = typeof window !== 'undefined' ? loadStoredProject() : null;

export const useLayoutStore = create<LayoutState>((set, get) => ({
  project: stored ?? createInitialProject(),
  selectedId: null,
  selectedIds: [],
  selectedRoomWallIndex: null,
  selectedSpaceId: null,
  activeTool: 'select',
  zoom: 0.9,
  pan: { x: 80, y: 50 },
  leftCollapsed: false,
  rightCollapsed: false,
  past: [],
  future: [],
  historyFutureCheckpoint: null,
  toast: null,
  lastSavedAt: stored?.updatedAt ?? null,
  saveStatus: stored ? 'local' : 'saving',
  clipboard: null,
  setProject: (project, message) =>
    set(() => ({
      past: [],
      future: [],
      historyFutureCheckpoint: null,
      project: { ...project, updatedAt: now() },
      selectedId: null,
      selectedIds: [],
      selectedRoomWallIndex: null,
      selectedSpaceId: null,
      activeTool: 'select',
      clipboard: null,
      toast: message ?? null,
    })),
  newProject: () =>
    set(() => ({
      past: [],
      future: [],
      historyFutureCheckpoint: null,
      project: createInitialProject(),
      selectedId: null,
      selectedIds: [],
      selectedRoomWallIndex: null,
      selectedSpaceId: null,
      activeTool: 'select',
      clipboard: null,
      toast: '빈 배치안을 만들었습니다.',
    })),
  selectObject: (id, additive = false) => set((state) => {
    if (!id) return { selectedId: null, selectedIds: [], selectedRoomWallIndex: null, selectedSpaceId: null };
    const object = state.project.objects.find((item) => item.id === id);
    const groupIds = object?.groupId
      ? state.project.objects.filter((item) => item.groupId === object.groupId).map((item) => item.id)
      : [id];
    if (!additive) return { selectedId: id, selectedIds: groupIds, selectedRoomWallIndex: null, selectedSpaceId: null };
    const selected = new Set(state.selectedIds);
    const shouldRemove = groupIds.every((groupId) => selected.has(groupId));
    groupIds.forEach((groupId) => shouldRemove ? selected.delete(groupId) : selected.add(groupId));
    const selectedIds = [...selected];
    return { selectedId: selectedIds.includes(id) ? id : selectedIds.at(-1) ?? null, selectedIds, selectedRoomWallIndex: null, selectedSpaceId: null };
  }),
  selectAll: () => set((state) => ({ selectedIds: state.project.objects.map((object) => object.id), selectedId: state.project.objects.at(-1)?.id ?? null, selectedRoomWallIndex: null, selectedSpaceId: null })),
  selectRoomWall: (selectedRoomWallIndex) => set({ selectedRoomWallIndex, selectedId: null, selectedIds: [], selectedSpaceId: null }),
  selectSpace: (selectedSpaceId) => set({ selectedSpaceId, selectedId: null, selectedIds: [], selectedRoomWallIndex: null }),
  updateSpace: (id, changes) => set((state) => ({
    past: [...state.past, state.project].slice(-50),
    future: [],
    project: {
      ...state.project,
      room: { ...state.project.room, spaces: (state.project.room.spaces ?? []).map((space) => space.id === id ? { ...space, ...changes } : space) },
      updatedAt: now(),
    },
  })),
  setActiveTool: (activeTool) => set((state) => {
    const selected = state.project.objects.find((object) => object.id === state.selectedId);
    const leavingWallMode = activeTool !== 'walls' && (selected?.type === 'wall' || selected?.type === 'glass-wall');
    return {
      activeTool,
      ...(activeTool === 'walls' ? {} : { selectedRoomWallIndex: null }),
      ...(leavingWallMode ? { selectedId: null, selectedIds: [] } : {}),
    };
  }),
  addRoomVertex: (wallIndex, point) => {
    const state = get();
    const vertices = state.project.room.vertices;
    if (wallIndex < 0 || wallIndex >= vertices.length) return;
    if (state.project.room.lockedWallIndices?.includes(wallIndex)) return set({ toast: '잠긴 외곽벽은 먼저 잠금을 해제해 주세요.' });
    const insertionIndex = wallIndex + 1;
    const shift = (indices: number[] | undefined) => (indices ?? []).map((index) => index > wallIndex ? index + 1 : index);
    const nextVertices = [...vertices.slice(0, insertionIndex), point, ...vertices.slice(insertionIndex)];
    const thicknesses = normalizeRoomWallThicknesses(vertices, state.project.room.wallThicknesses);
    const nextThicknesses = [...thicknesses.slice(0, insertionIndex), thicknesses[wallIndex], ...thicknesses.slice(insertionIndex)];
    set({
      past: [...state.past, state.project].slice(-50), future: [],
      project: { ...state.project, room: { ...state.project.room, vertices: nextVertices, wallThicknesses: nextThicknesses, lockedWallIndices: shift(state.project.room.lockedWallIndices), removedWallIndices: shift(state.project.room.removedWallIndices) }, updatedAt: now() },
      selectedRoomWallIndex: wallIndex,
      toast: '외곽 꼭짓점을 추가했습니다.',
    });
  },
  splitSelectedLine: () => {
    const state = get();
    if (state.selectedRoomWallIndex !== null) {
      const index = state.selectedRoomWallIndex;
      const start = state.project.room.vertices[index];
      const end = state.project.room.vertices[(index + 1) % state.project.room.vertices.length];
      state.addRoomVertex(index, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 });
      return;
    }
    const source = state.project.objects.find((object) => object.id === state.selectedId);
    if (!source || (source.type !== 'wall' && source.type !== 'glass-wall')) return set({ toast: '분할할 일반 벽 또는 유리벽을 선택해 주세요.' });
    if (source.locked) return set({ toast: '잠긴 벽은 먼저 잠금을 해제해 주세요.' });
    const { start, end } = getLineEndpoints(source);
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const firstGeometry = source.type === 'wall'
      ? wallFromEndpoints(start, midpoint, source.depth, source.wallSide ?? -1)
      : lineRectFromEndpoints(start, midpoint, source.depth);
    const secondGeometry = source.type === 'wall'
      ? wallFromEndpoints(midpoint, end, source.depth, source.wallSide ?? -1)
      : lineRectFromEndpoints(midpoint, end, source.depth);
    const second = { ...source, ...secondGeometry, id: uid(source.type), name: `${source.name} 2` };
    const objects = state.project.objects.flatMap((object) => object.id === source.id ? [{ ...object, ...firstGeometry, name: `${source.name} 1` }, second] : [object]);
    set({ past: [...state.past, state.project].slice(-50), future: [], project: { ...state.project, objects, updatedAt: now() }, selectedId: second.id, selectedIds: [source.id, second.id], toast: '벽을 두 구간으로 분할했습니다.' });
  },
  mergeSelectedRoomWall: () => {
    const state = get();
    const index = state.selectedRoomWallIndex;
    const vertices = state.project.room.vertices;
    if (index === null || vertices.length <= 3) return set({ toast: '병합할 외곽벽을 선택해 주세요.' });
    const nextIndex = (index + 1) % vertices.length;
    const thicknesses = normalizeRoomWallThicknesses(vertices, state.project.room.wallThicknesses);
    if (thicknesses[index] !== thicknesses[nextIndex]) return set({ toast: `두 벽의 두께가 ${thicknesses[index]} mm와 ${thicknesses[nextIndex]} mm로 달라 병합할 수 없습니다. 먼저 같은 두께로 맞춰 주세요.` });
    const locked = new Set(state.project.room.lockedWallIndices ?? []);
    if (locked.has(index) || locked.has(nextIndex)) return set({ toast: '인접한 두 벽의 잠금을 먼저 해제해 주세요.' });
    const removeVertexIndex = nextIndex;
    if (removeVertexIndex === 0) return set({ toast: '첫 꼭짓점을 가로지르는 병합은 반대쪽 벽을 선택해 주세요.' });
    const remap = (indices: number[] | undefined) => (indices ?? []).flatMap((wall) => wall === removeVertexIndex ? [] : [wall > removeVertexIndex ? wall - 1 : wall]);
    const nextVertices = vertices.filter((_, vertexIndex) => vertexIndex !== removeVertexIndex);
    const nextThicknesses = thicknesses.filter((_, wallIndex) => wallIndex !== removeVertexIndex);
    set({
      past: [...state.past, state.project].slice(-50), future: [],
      project: { ...state.project, room: { ...state.project.room, vertices: nextVertices, wallThicknesses: nextThicknesses, lockedWallIndices: remap(state.project.room.lockedWallIndices), removedWallIndices: remap(state.project.room.removedWallIndices) }, updatedAt: now() },
      selectedRoomWallIndex: Math.min(index, nextVertices.length - 1), toast: '인접 외곽벽을 병합했습니다.',
    });
  },
  mergeSelectedWalls: () => {
    const state = get();
    const selected = state.project.objects.filter((object) => state.selectedIds.includes(object.id));
    if (selected.length !== 2 || selected.some((object) => object.type !== 'wall' && object.type !== 'glass-wall')) return set({ toast: '병합할 일반 벽 또는 유리벽 두 개를 선택해 주세요.' });
    const [first, second] = selected;
    if (first.locked || second.locked) return set({ toast: '잠긴 벽은 병합할 수 없습니다.' });
    if (first.type !== second.type || Math.abs(first.depth - second.depth) > 0.1 || (first.type === 'wall' && first.wallSide !== second.wallSide)) return set({ toast: '유형, 두께와 벽면 방향이 같은 벽만 병합할 수 있습니다.' });
    const firstEnds = getLineEndpoints(first); const secondEnds = getLineEndpoints(second);
    const direction = { x: firstEnds.end.x - firstEnds.start.x, y: firstEnds.end.y - firstEnds.start.y };
    const length = Math.hypot(direction.x, direction.y) || 1;
    const crossError = Math.abs(direction.x * (secondEnds.end.y - secondEnds.start.y) - direction.y * (secondEnds.end.x - secondEnds.start.x)) / length;
    const endpointPairs = [
      [firstEnds.start, secondEnds.start], [firstEnds.start, secondEnds.end],
      [firstEnds.end, secondEnds.start], [firstEnds.end, secondEnds.end],
    ] as const;
    const connected = endpointPairs.some(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y) <= 1);
    if (!connected || crossError > 1) return set({ toast: '끝점이 연결되고 동일 선상인 벽만 병합할 수 있습니다.' });
    const points = [firstEnds.start, firstEnds.end, secondEnds.start, secondEnds.end];
    const origin = points[0]; const unit = { x: direction.x / length, y: direction.y / length };
    const sorted = points.map((point) => ({ point, projection: (point.x - origin.x) * unit.x + (point.y - origin.y) * unit.y })).sort((a, b) => a.projection - b.projection);
    const geometry = first.type === 'wall'
      ? wallFromEndpoints(sorted[0].point, sorted.at(-1)!.point, first.depth, first.wallSide ?? -1)
      : lineRectFromEndpoints(sorted[0].point, sorted.at(-1)!.point, first.depth);
    const objects = state.project.objects.flatMap((object) => object.id === first.id ? [{ ...first, ...geometry, name: first.name.replace(/ [12]$/, '') }] : object.id === second.id ? [] : [object]);
    set({ past: [...state.past, state.project].slice(-50), future: [], project: { ...state.project, objects, updatedAt: now() }, selectedId: first.id, selectedIds: [first.id], toast: '두 벽을 한 구간으로 병합했습니다.' });
  },
  updateRoomWallThickness: (index, thickness) => set((state) => {
    if (state.project.room.lockedWallIndices?.includes(index)) return { toast: '잠긴 외곽벽의 두께는 변경할 수 없습니다.' };
    const wallThicknesses = normalizeRoomWallThicknesses(state.project.room.vertices, state.project.room.wallThicknesses);
    wallThicknesses[index] = Math.max(50, Math.min(500, Math.round(thickness / 10) * 10));
    return {
      past: [...state.past, state.project].slice(-50), future: [],
      project: {
        ...state.project,
        room: { ...state.project.room, wallThicknesses },
        objects: synchronizeWallDependents(state.project.objects, state.project.room.vertices, state.project.room.removedWallIndices, wallThicknesses),
        updatedAt: now(),
      },
    };
  }),
  rotateProject: (degrees) => {
    const state = get();
    const rotate = (point: Point): Point => degrees === 90 ? { x: -point.y, y: point.x } : { x: point.y, y: -point.x };
    const rotatedVertices = state.project.room.vertices.map(rotate);
    const minX = Math.min(...rotatedVertices.map((point) => point.x));
    const minY = Math.min(...rotatedVertices.map((point) => point.y));
    const translate = (point: Point) => { const rotated = rotate(point); return { x: rotated.x - minX, y: rotated.y - minY }; };
    const objects = state.project.objects.map((object) => {
      const center = translate({ x: object.x + object.width / 2, y: object.y + object.depth / 2 });
      return { ...object, x: center.x - object.width / 2, y: center.y - object.depth / 2, rotation: ((object.rotation + degrees) % 360 + 360) % 360 };
    });
    const spaces = state.project.room.spaces?.map((space) => {
      const corners = [
        translate({ x: space.bounds.x, y: space.bounds.y }),
        translate({ x: space.bounds.x + space.bounds.width, y: space.bounds.y }),
        translate({ x: space.bounds.x + space.bounds.width, y: space.bounds.y + space.bounds.depth }),
        translate({ x: space.bounds.x, y: space.bounds.y + space.bounds.depth }),
      ];
      const xs = corners.map((point) => point.x); const ys = corners.map((point) => point.y);
      return { ...space, bounds: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...ys) - Math.min(...ys) } };
    });
    const dimensions = state.project.room.dimensions?.map((dimension) => ({ ...dimension, start: translate(dimension.start), end: translate(dimension.end) }));
    const rotationDegrees = ((state.project.orientation.rotationDegrees + degrees) % 360 + 360) % 360;
    set({ past: [...state.past, state.project].slice(-50), future: [], project: { ...state.project, room: { ...state.project.room, vertices: rotatedVertices.map((point) => ({ x: point.x - minX, y: point.y - minY })), spaces, dimensions }, objects, orientation: { rotationDegrees, label: `${rotationDegrees}° 회전` }, updatedAt: now() }, toast: `프로젝트를 ${degrees > 0 ? '오른쪽' : '왼쪽'}으로 90° 회전했습니다.` });
  },
  resetFurniture: () => {
    const state = get();
    const nextObjects = state.project.objects.filter((object) => !furnitureTypes.has(object.type));
    set({ past: [...state.past, state.project].slice(-50), future: [], project: { ...state.project, objects: nextObjects, updatedAt: now() }, selectedId: null, selectedIds: [], toast: '가구만 초기화했습니다.' });
  },
  resetAll: () => {
    const state = get();
    const project = createOfficialProject(); project.projectName = state.project.projectName;
    set({ past: [...state.past, state.project].slice(-50), future: [], project, selectedId: null, selectedIds: [], selectedRoomWallIndex: null, selectedSpaceId: null, toast: '공식 도면 전체를 복원했습니다.' });
  },
  groupSelected: () => {
    const state = get();
    if (state.selectedIds.length < 2) return set({ toast: '그룹화할 객체를 두 개 이상 선택해 주세요.' });
    const groupId = `group-${crypto.randomUUID()}`;
    set({
      past: [...state.past, state.project].slice(-50), future: [],
      project: { ...state.project, objects: state.project.objects.map((object) => state.selectedIds.includes(object.id) ? { ...object, groupId } : object), updatedAt: now() },
      toast: `${state.selectedIds.length}개 객체를 그룹화했습니다.`,
    });
  },
  ungroupSelected: () => {
    const state = get();
    const ids = new Set(state.selectedIds);
    if (![...ids].some((id) => state.project.objects.find((object) => object.id === id)?.groupId)) return;
    set({
      past: [...state.past, state.project].slice(-50), future: [],
      project: { ...state.project, objects: state.project.objects.map((object) => ids.has(object.id) ? { ...object, groupId: undefined } : object), updatedAt: now() },
      toast: '선택한 그룹을 해제했습니다.',
    });
  },
  alignSelected: (mode) => {
    const state = get();
    const selected = state.project.objects.filter((object) => state.selectedIds.includes(object.id) && !object.locked);
    if (selected.length < 2) return;
    const bounds = new Map(selected.map((object) => [object.id, rotatedBounds(object)]));
    const left = Math.min(...selected.map((object) => bounds.get(object.id)!.left));
    const right = Math.max(...selected.map((object) => bounds.get(object.id)!.right));
    const top = Math.min(...selected.map((object) => bounds.get(object.id)!.top));
    const bottom = Math.max(...selected.map((object) => bounds.get(object.id)!.bottom));
    const updates = new Map(selected.map((object) => [object.id, {
      ...object,
      ...(mode === 'left' ? { x: object.x + left - bounds.get(object.id)!.left } : mode === 'right' ? { x: object.x + right - bounds.get(object.id)!.right } : mode === 'center-x' ? { x: object.x + (left + right) / 2 - bounds.get(object.id)!.centerX } : {}),
      ...(mode === 'top' ? { y: object.y + top - bounds.get(object.id)!.top } : mode === 'bottom' ? { y: object.y + bottom - bounds.get(object.id)!.bottom } : mode === 'center-y' ? { y: object.y + (top + bottom) / 2 - bounds.get(object.id)!.centerY } : {}),
    }]));
    set({ past: [...state.past, state.project].slice(-50), future: [], project: { ...state.project, objects: state.project.objects.map((object) => updates.get(object.id) ?? object), updatedAt: now() }, toast: '선택 객체를 정렬했습니다.' });
  },
  distributeSelected: (axis) => {
    const state = get();
    const selected = state.project.objects.filter((object) => state.selectedIds.includes(object.id) && !object.locked)
      .sort((a, b) => axis === 'horizontal'
        ? rotatedBounds(a).centerX - rotatedBounds(b).centerX
        : rotatedBounds(a).centerY - rotatedBounds(b).centerY);
    if (selected.length < 3) return;
    const first = selected[0];
    const last = selected.at(-1)!;
    const start = axis === 'horizontal' ? rotatedBounds(first).centerX : rotatedBounds(first).centerY;
    const end = axis === 'horizontal' ? rotatedBounds(last).centerX : rotatedBounds(last).centerY;
    const updates = new Map(selected.map((object, index) => {
      const center = start + (end - start) * index / (selected.length - 1);
      const bounds = rotatedBounds(object);
      return [object.id, axis === 'horizontal' ? { ...object, x: object.x + center - bounds.centerX } : { ...object, y: object.y + center - bounds.centerY }];
    }));
    set({ past: [...state.past, state.project].slice(-50), future: [], project: { ...state.project, objects: state.project.objects.map((object) => updates.get(object.id) ?? object), updatedAt: now() }, toast: '선택 객체의 간격을 균등하게 배치했습니다.' });
  },
  toggleSelectedRoomWallLock: () =>
    set((state) => {
      const index = state.selectedRoomWallIndex;
      if (index === null) return state;
      const locked = new Set(state.project.room.lockedWallIndices ?? []);
      if (locked.has(index)) locked.delete(index);
      else locked.add(index);
      return {
        past: [...state.past, state.project].slice(-50),
        future: [],
        project: {
          ...state.project,
          room: { ...state.project.room, lockedWallIndices: [...locked].sort((a, b) => a - b) },
          updatedAt: now(),
        },
        toast: locked.has(index) ? `벽 ${index + 1} 잠금` : `벽 ${index + 1} 잠금 해제`,
      };
    }),
  deleteSelectedRoomWall: () => {
    const state = get();
    const index = state.selectedRoomWallIndex;
    if (index === null) return;
    if (state.project.room.lockedWallIndices?.includes(index)) {
      set({ toast: '잠긴 벽은 삭제할 수 없습니다.' });
      return;
    }
    const removed = new Set(state.project.room.removedWallIndices ?? []);
    removed.add(index);
    set({
      past: [...state.past, state.project].slice(-50),
      future: [],
      project: {
        ...state.project,
        room: { ...state.project.room, removedWallIndices: [...removed].sort((a, b) => a - b) },
        updatedAt: now(),
      },
      selectedRoomWallIndex: null,
      toast: `벽 ${index + 1} 삭제 완료`,
    });
  },
  addObject: (type, position) => {
    const state = get();
    const item = catalogByType[type];
    const sameTypeCount = state.project.objects.filter((object) => object.type === type).length;
    const id = uid(type);
    const bounds = roomBounds(state.project.room.vertices);
    const overlaps = (x: number, y: number) => state.project.objects.some((other) => !(
      x + item.width <= other.x || x >= other.x + other.width ||
      y + item.depth <= other.y || y >= other.y + other.depth
    ));
    let defaultX = position?.x ?? bounds.left + bounds.width / 2 - item.width / 2;
    let defaultY = position?.y ?? bounds.top + bounds.height / 2 - item.depth / 2;
    if (!position && !wallMountedTypes.has(type)) {
      for (let attempt = 0; attempt < 30 && overlaps(defaultX, defaultY); attempt += 1) {
        const column = (sameTypeCount + attempt + 1) % 5;
        const row = Math.floor((sameTypeCount + attempt + 1) / 5);
        defaultX = bounds.left + bounds.width / 2 - item.width / 2 + column * 250;
        defaultY = bounds.top + bounds.height / 2 - item.depth / 2 + row * 250;
      }
    }
    let object: LayoutObject = {
      id,
      type,
      name: `${item.label} ${sameTypeCount + 1}`,
      x: defaultX,
      y: defaultY,
      width: item.width,
      depth: item.depth,
      rotation: 0,
      locked: false,
      ...(item.color ? { color: item.color } : {}),
      ...(item.height ? { height: item.height, heightSource: 'catalog' as const } : {}),
      ...(item.seats ? { seats: item.seats } : {}),
      ...(type === 'wall' ? { wallSide: -1 as const } : {}),
      ...(type === 'door' ? { doorHinge: 'left' as const, doorSwing: 'inward' as const, doorOpeningAngle: 90 } : {}),
    };
    if (wallMountedTypes.has(type) && state.project.settings.objectSnapEnabled) {
      object = { ...object, ...snapMountedObject(object, state.project.room.vertices, state.project.room.removedWallIndices, state.project.room.wallThicknesses, state.project.objects) };
    } else if (type === 'wall') {
      object = snapWallSurfaceToGrid(object, state.project.settings.gridSize, state.project.settings.snapEnabled, state.project.settings.orthogonalSnapEnabled);
    }
    object = withValidSpace(object, state.project.room.spaces);
    set({
      past: [...state.past, state.project].slice(-50),
      future: [],
      project: {
        ...state.project,
        objects: type === 'wall' || type === 'glass-wall'
          ? synchronizeWallDependents([...state.project.objects, object], state.project.room.vertices, state.project.room.removedWallIndices, state.project.room.wallThicknesses)
          : [...state.project.objects, object],
        updatedAt: now(),
      },
      selectedId: id,
      selectedIds: [id],
      selectedRoomWallIndex: null,
      activeTool: type === 'wall' || type === 'glass-wall' ? 'walls' : state.activeTool,
      toast: `${item.label} 추가 완료`,
    });
    return id;
  },
  updateObject: (id, changes, record = true, applyPlacementSnap = true) =>
    set((state) => {
      const current = state.project.objects.find((object) => object.id === id);
      const placementChanged = ['x', 'y', 'width', 'depth', 'rotation', 'type']
        .some((key) => Object.prototype.hasOwnProperty.call(changes, key));
      let objects = state.project.objects.map((object) => {
        if (object.id !== id) return object;
        const changed = { ...object, ...changes };
        const next = withValidSpace(changed, state.project.room.spaces, Object.prototype.hasOwnProperty.call(changes, 'spaceId') ? changes.spaceId ?? '' : undefined);
        return applyPlacementSnap && placementChanged && state.project.settings.objectSnapEnabled && wallMountedTypes.has(next.type)
          ? { ...next, ...snapMountedObject(next, state.project.room.vertices, state.project.room.removedWallIndices, state.project.room.wallThicknesses, state.project.objects) }
          : next;
      });
      if (current?.type === 'wall' || current?.type === 'glass-wall' || changes.type === 'wall' || changes.type === 'glass-wall') {
        objects = synchronizeWallDependents(objects, state.project.room.vertices, state.project.room.removedWallIndices, state.project.room.wallThicknesses, current?.type === 'wall' || current?.type === 'glass-wall' ? current : undefined);
      }
      return {
        past: record ? [...state.past, state.project].slice(-50) : state.past,
        future: record ? [] : state.future,
        project: { ...state.project, objects, updatedAt: now() },
      };
    }),
  deleteSelected: () => {
    const state = get();
    const ids = new Set(state.selectedIds.length ? state.selectedIds : state.selectedId ? [state.selectedId] : []);
    const selected = state.project.objects.filter((item) => ids.has(item.id));
    if (!selected.length) return;
    const deletable = selected.filter((object) => !object.locked);
    if (!deletable.length) return set({ toast: '잠긴 객체는 삭제할 수 없습니다.' });
    const deleteIds = new Set(deletable.map((object) => object.id));
    const remainingObjects = state.project.objects.filter((item) => !deleteIds.has(item.id));
    set({
      past: [...state.past, state.project].slice(-50),
      future: [],
      project: {
        ...state.project,
        objects: deletable.some((object) => object.type === 'wall' || object.type === 'glass-wall')
          ? synchronizeWallDependents(remainingObjects, state.project.room.vertices, state.project.room.removedWallIndices, state.project.room.wallThicknesses)
          : remainingObjects,
        updatedAt: now(),
      },
      selectedId: null,
      selectedIds: [],
      selectedRoomWallIndex: null,
      toast: `${deletable.length}개 객체 삭제 완료`,
    });
  },
  duplicateSelected: () => {
    const state = get();
    const ids = state.selectedIds.length ? state.selectedIds : state.selectedId ? [state.selectedId] : [];
    const sources = state.project.objects.filter((item) => ids.includes(item.id));
    if (!sources.length) return;
    const groupMap = new Map<string, string>();
    const copies = sources.map((source) => {
      const id = uid(source.type);
      if (source.groupId && !groupMap.has(source.groupId)) groupMap.set(source.groupId, `group-${crypto.randomUUID()}`);
      let copy: LayoutObject = {
        ...source, id, name: `${source.name} 복사본`,
        x: source.x + state.project.settings.gridSize * 2,
        y: source.y + state.project.settings.gridSize * 2,
        locked: false,
        ...(source.groupId ? { groupId: groupMap.get(source.groupId) } : {}),
      };
      if (state.project.settings.objectSnapEnabled && wallMountedTypes.has(copy.type)) copy = { ...copy, ...snapMountedObject(copy, state.project.room.vertices, state.project.room.removedWallIndices, state.project.room.wallThicknesses, [...state.project.objects, ...sources]) };
      return copy;
    });
    const nextObjects = [...state.project.objects, ...copies];
    set({
      past: [...state.past, state.project].slice(-50),
      future: [],
      project: { ...state.project, objects: copies.some((copy) => copy.type === 'wall' || copy.type === 'glass-wall')
        ? synchronizeWallDependents(nextObjects, state.project.room.vertices, state.project.room.removedWallIndices, state.project.room.wallThicknesses)
        : nextObjects, updatedAt: now() },
      selectedId: copies.at(-1)!.id,
      selectedIds: copies.map((copy) => copy.id),
      selectedRoomWallIndex: null,
      toast: `${copies.length}개 객체 복제 완료`,
    });
  },
  copySelected: () => {
    const state = get();
    const object = state.project.objects.find((item) => item.id === state.selectedId);
    if (!object) return;
    set({ clipboard: { ...object }, toast: `${object.name} 복사 완료` });
  },
  pasteObject: () => {
    const state = get();
    if (!state.clipboard) {
      set({ toast: '먼저 복사할 객체를 선택해 주세요.' });
      return;
    }
    const id = uid(state.clipboard.type);
    let copy: LayoutObject = {
      ...state.clipboard,
      id,
      name: `${state.clipboard.name} 복사본`,
      x: state.clipboard.x + state.project.settings.gridSize * 2,
      y: state.clipboard.y + state.project.settings.gridSize * 2,
      locked: false,
      groupId: undefined,
    };
    if (state.project.settings.objectSnapEnabled && wallMountedTypes.has(copy.type)) copy = { ...copy, ...snapMountedObject(copy, state.project.room.vertices, state.project.room.removedWallIndices, state.project.room.wallThicknesses, state.project.objects) };
    set({
      past: [...state.past, state.project].slice(-50),
      future: [],
      project: { ...state.project, objects: copy.type === 'wall' || copy.type === 'glass-wall'
        ? synchronizeWallDependents([...state.project.objects, copy], state.project.room.vertices, state.project.room.removedWallIndices, state.project.room.wallThicknesses)
        : [...state.project.objects, copy], updatedAt: now() },
      selectedId: id,
      selectedIds: [id],
      selectedRoomWallIndex: null,
      toast: `${state.clipboard.name} 붙여넣기 완료`,
    });
  },
  toggleSelectedLock: () => {
    const state = get();
    if (!state.selectedId) return;
    const object = state.project.objects.find((item) => item.id === state.selectedId);
    if (!object) return;
    state.updateObject(object.id, { locked: !object.locked });
  },
  updateProjectName: (projectName) =>
    set((state) => ({
      past: state.project.projectName === projectName ? state.past : [...state.past, state.project].slice(-50),
      future: state.project.projectName === projectName ? state.future : [],
      project: { ...state.project, projectName, updatedAt: now() },
    })),
  updateRoomName: (name) =>
    set((state) => ({
      past: state.project.room.name === name ? state.past : [...state.past, state.project].slice(-50),
      future: state.project.room.name === name ? state.future : [],
      project: { ...state.project, room: { ...state.project.room, name }, updatedAt: now() },
    })),
  updateRoomVertices: (vertices, record = true) =>
    set((state) => {
      const wallThicknesses = normalizeRoomWallThicknesses(vertices, state.project.room.wallThicknesses);
      return {
        past: record ? [...state.past, state.project].slice(-50) : state.past,
        future: record ? [] : state.future,
        project: {
          ...state.project,
          room: { ...state.project.room, vertices, wallThicknesses },
          objects: synchronizeWallDependents(state.project.objects, vertices, state.project.room.removedWallIndices, wallThicknesses),
          updatedAt: now(),
        },
      };
    }),
  updateSettings: (changes) =>
    set((state) => ({
      past: [...state.past, state.project].slice(-50),
      future: [],
      project: {
        ...state.project,
        settings: { ...state.project.settings, ...changes },
        updatedAt: now(),
      },
    })),
  beginHistory: () =>
    set((state) => ({
      past: [...state.past, state.project].slice(-50),
      future: [],
      historyFutureCheckpoint: state.future,
    })),
  commitHistory: () =>
    set((state) => {
      const previous = state.past.at(-1);
      const fingerprint = (project: LayoutProject) => JSON.stringify({ ...project, updatedAt: '' });
      if (previous && fingerprint(previous) === fingerprint(state.project)) {
        return {
          past: state.past.slice(0, -1),
          future: state.historyFutureCheckpoint ?? state.future,
          historyFutureCheckpoint: null,
        };
      }
      return { historyFutureCheckpoint: null };
    }),
  cancelHistory: () =>
    set((state) => {
      const previous = state.past.at(-1);
      return {
        past: state.past.slice(0, -1),
        future: state.historyFutureCheckpoint ?? state.future,
        historyFutureCheckpoint: null,
        ...(previous ? { project: previous } : {}),
      };
    }),
  undo: () =>
    set((state) => {
      const previous = state.past.at(-1);
      if (!previous) return { toast: '되돌릴 작업이 없습니다.' };
      return {
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future].slice(0, 50),
        project: previous,
        selectedId: null,
        selectedIds: [],
        selectedRoomWallIndex: null,
        selectedSpaceId: null,
        toast: '실행 취소했습니다.',
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return { toast: '다시 실행할 작업이 없습니다.' };
      return {
        past: [...state.past, state.project].slice(-50),
        future: state.future.slice(1),
        project: next,
        selectedId: null,
        selectedIds: [],
        selectedRoomWallIndex: null,
        selectedSpaceId: null,
        toast: '다시 실행했습니다.',
      };
    }),
  setView: (zoom, pan) => set({ zoom, pan }),
  setPan: (pan) => set({ pan }),
  setZoom: (zoom) => set({ zoom }),
  togglePanel: (side) =>
    set((state) =>
      side === 'left'
        ? { leftCollapsed: !state.leftCollapsed }
        : { rightCollapsed: !state.rightCollapsed },
    ),
  setPanels: (panels) => set(panels),
  showToast: (toast) => set({ toast }),
  markSaved: (lastSavedAt) => set({ lastSavedAt, saveStatus: 'local' }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
}));
