import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
    type DragEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react';
import { catalogByType } from '../../data/objectCatalog';
import { WALL_COLOR, WALL_SNAP_STEP, WALL_THICKNESS } from '../../data/layoutConstants';
import { useLayoutStore } from '../../store/layoutStore';
import type { LayoutObject, LayoutObjectType, LayoutWarning, Point } from '../../types/layout';
import { alignObjectPosition, type AlignmentGuides } from '../../utils/alignment';
import {
  BASE_PX_PER_MM,
  clampZoom,
  formatMillimeters,
  mmLengthToPx,
  mmToScreen,
  pxLengthToMm,
  resizeRotatedObject,
  rotatedBounds,
  roomBounds,
  screenToMm,
} from '../../utils/coordinates';
import { normalizeRotation, snapToGrid } from '../../utils/snapping';
import { doorSwingPath } from '../../utils/doorGeometry';
import { getRoomWallOuterSegments, isRoomBoundaryClosed, isValidRoomPolygon, moveRoomWallParallel, snapRoomVertexToOrthogonal } from '../../utils/roomGeometry';
import { getClosedWallLoops, getObjectWallFaceGeometry, getRoomWallFaceGeometries, getWallJoinPolygons } from '../../utils/wallGeometry';
import {
  FURNITURE_WALL_SNAP_DISTANCE,
  furnitureWallSnapTypes,
  getFurnitureWallSnapCandidate,
  getLinearWallEndpoints,
  getObjectWallSnapSurfaces,
  getRoomWallSnapSurfaces,
  getWallEndpoints,
  linearWallFromEndpoints,
  resolveFurnitureDragPosition,
  roomInteriorSwingSign,
  snapObjectToWallSurfaces,
  snapWallSurfaceToGrid,
  wallFromEndpoints,
  wallMountedTypes,
  type FurnitureWallSnapCandidate,
} from '../../utils/structurePlacement';
import { Icon } from '../icons/Icon';
import { PlanSymbol } from './PlanSymbol';

export type LayoutCanvasHandle = { fitView: () => void; focusObject: (id: string) => void };

type CanvasSize = { width: number; height: number };
type Corner = 'nw' | 'ne' | 'se' | 'sw';
type Interaction =
  | { kind: 'move'; objectId: string; start: Point; source: LayoutObject; groupSources: LayoutObject[] }
  | { kind: 'resize'; objectId: string; corner: Corner; start: Point; source: LayoutObject }
  | { kind: 'wall-endpoint'; objectId: string; endType: 'start' | 'end'; start: Point; source: LayoutObject }
  | { kind: 'rotate'; objectId: string; center: Point; source: LayoutObject }
  | { kind: 'room-wall'; wallIndex: number; start: Point; sourceVertices: Point[]; normal: Point }
  | { kind: 'room-vertex'; vertexIndex: number; start: Point; sourceVertices: Point[] }
  | { kind: 'select-box'; start: Point; current: Point }
  | { kind: 'pan'; start: Point; sourcePan: Point };
type Readout = { kind: 'position' | 'size' | 'rotation'; text: string; point: Point } | null;

function pointerInElement(event: { clientX: number; clientY: number }, element: SVGSVGElement): Point {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export const LayoutCanvas = forwardRef<LayoutCanvasHandle, { warnings: LayoutWarning[]; onOpenWarnings: () => void }>(
  function LayoutCanvas({ warnings, onOpenWarnings }, ref) {
    const svgRef = useRef<SVGSVGElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const interactionRef = useRef<Interaction | null>(null);
    const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
    const didInitialFitRef = useRef(false);
    const sizeRef = useRef({ width: 0, height: 0 });
    const [guides, setGuides] = useState<AlignmentGuides>({});
    const [wallSnapCandidate, setWallSnapCandidate] = useState<FurnitureWallSnapCandidate | null>(null);
    const [readout, setReadout] = useState<Readout>(null);
    const [draggingCanvas, setDraggingCanvas] = useState(false);
    const [selectionBox, setSelectionBox] = useState<{ start: Point; end: Point } | null>(null);
    const [spacePressed, setSpacePressed] = useState(false);
    const [measurePoints, setMeasurePoints] = useState<Point[]>([]);
    const spacePressedRef = useRef(false);

    const project = useLayoutStore((state) => state.project);
    const selectedId = useLayoutStore((state) => state.selectedId);
    const selectedIds = useLayoutStore((state) => state.selectedIds);
    const selectedRoomWallIndex = useLayoutStore((state) => state.selectedRoomWallIndex);
    const selectedSpaceId = useLayoutStore((state) => state.selectedSpaceId);
    const activeTool = useLayoutStore((state) => state.activeTool);
    const zoom = useLayoutStore((state) => state.zoom);
    const pan = useLayoutStore((state) => state.pan);
    const viewRef = useRef({ zoom, pan });
    const selectObject = useLayoutStore((state) => state.selectObject);
    const selectRoomWall = useLayoutStore((state) => state.selectRoomWall);
    const selectSpace = useLayoutStore((state) => state.selectSpace);
    const setActiveTool = useLayoutStore((state) => state.setActiveTool);
    const addRoomVertex = useLayoutStore((state) => state.addRoomVertex);
    const updateObject = useLayoutStore((state) => state.updateObject);
    const updateRoomVertices = useLayoutStore((state) => state.updateRoomVertices);
    const addObject = useLayoutStore((state) => state.addObject);
    const beginHistory = useLayoutStore((state) => state.beginHistory);
    const commitHistory = useLayoutStore((state) => state.commitHistory);
    const cancelHistory = useLayoutStore((state) => state.cancelHistory);
    const setView = useLayoutStore((state) => state.setView);
    const setPan = useLayoutStore((state) => state.setPan);
    const warningIds = useMemo(() => new Set(warnings.flatMap((warning) => warning.objectIds)), [warnings]);
    const view = useMemo(() => ({ zoom, pan }), [pan, zoom]);
    const scale = BASE_PX_PER_MM * zoom;
    const formatLength = useCallback((value: number) => formatMillimeters(value, project.settings.unit), [project.settings.unit]);

    useEffect(() => {
      viewRef.current = { zoom, pan };
    }, [pan, zoom]);

    useEffect(() => {
      const element = wrapRef.current;
      if (!element) return;
      const observer = new ResizeObserver(([entry]) => {
        const nextSize = { width: entry.contentRect.width, height: entry.contentRect.height };
        const previousSize = sizeRef.current;
        sizeRef.current = nextSize;
        setSize(nextSize);
        if (!didInitialFitRef.current || previousSize.width <= 0 || previousSize.height <= 0) return;
        const currentView = viewRef.current;
        const nextPan = {
          x: currentView.pan.x + (nextSize.width - previousSize.width) / 2,
          y: currentView.pan.y + (nextSize.height - previousSize.height) / 2,
        };
        viewRef.current = { zoom: currentView.zoom, pan: nextPan };
        setView(currentView.zoom, nextPan);
      });
      observer.observe(element);
      return () => observer.disconnect();
    }, [setView]);

    const fitView = useCallback(() => {
      const room = roomBounds(project.room.vertices);
      const objectBounds = project.objects.map(rotatedBounds);
      const bounds = objectBounds.length === 0 ? room : {
        left: Math.min(room.left, ...objectBounds.map((item) => item.left)),
        top: Math.min(room.top, ...objectBounds.map((item) => item.top)),
        right: Math.max(room.right, ...objectBounds.map((item) => item.right)),
        bottom: Math.max(room.bottom, ...objectBounds.map((item) => item.bottom)),
        width: 0,
        height: 0,
      };
      bounds.width = bounds.right - bounds.left;
      bounds.height = bounds.bottom - bounds.top;
      const padding = 90;
      const nextZoom = clampZoom(
        Math.min(
          (size.width - padding * 2) / (bounds.width * BASE_PX_PER_MM),
          (size.height - padding * 2) / (bounds.height * BASE_PX_PER_MM),
        ),
      );
      const nextScale = BASE_PX_PER_MM * nextZoom;
      setView(nextZoom, {
        x: (size.width - bounds.width * nextScale) / 2 - bounds.left * nextScale,
        y: (size.height - bounds.height * nextScale) / 2 - bounds.top * nextScale,
      });
    }, [project.objects, project.room.vertices, setView, size]);

    const focusObject = useCallback((id: string) => {
      const object = project.objects.find((item) => item.id === id);
      if (!object) return;
      const currentScale = BASE_PX_PER_MM * zoom;
      setPan({
        x: size.width / 2 - (object.x + object.width / 2) * currentScale,
        y: size.height / 2 - (object.y + object.depth / 2) * currentScale,
      });
    }, [project.objects, setPan, size.height, size.width, zoom]);

    useImperativeHandle(ref, () => ({ fitView, focusObject }), [fitView, focusObject]);

    useEffect(() => {
      if (!didInitialFitRef.current && size.width > 0 && size.height > 0) {
        didInitialFitRef.current = true;
        fitView();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size.width, size.height]);

    const startObjectInteraction = (
      event: ReactPointerEvent<SVGElement>,
      object: LayoutObject,
      kind: 'move' | 'resize' | 'rotate' | 'wall-endpoint',
      corner?: Corner,
      endType?: 'start' | 'end',
    ) => {
      if (event.button !== 0) return;
      const isEditableWall = object.type === 'wall' || object.type === 'glass-wall';
      if ((isEditableWall && activeTool !== 'walls') || (!isEditableWall && activeTool === 'walls')) return;
      event.stopPropagation();
      event.currentTarget.focus({ preventScroll: true });
      if (event.shiftKey) {
        selectObject(object.id, true);
        return;
      }
      if (!selectedIds.includes(object.id)) selectObject(object.id);
      if (object.locked || !svgRef.current) return;
      const start = pointerInElement(event, svgRef.current);
      beginHistory();
      setWallSnapCandidate(null);
      if (kind === 'move') interactionRef.current = {
        kind, objectId: object.id, start, source: { ...object },
        groupSources: project.objects.filter((item) => selectedIds.includes(item.id) && item.id !== object.id && !item.locked).map((item) => ({ ...item })),
      };
      if (kind === 'resize' && corner) interactionRef.current = { kind, corner, objectId: object.id, start, source: { ...object } };
      if (kind === 'wall-endpoint' && endType) interactionRef.current = { kind, endType, objectId: object.id, start, source: { ...object } };
      if (kind === 'rotate') interactionRef.current = { kind, objectId: object.id, source: { ...object }, center: mmToScreen({ x: object.x + object.width / 2, y: object.y + object.depth / 2 }, view) };
      svgRef.current.setPointerCapture(event.pointerId);
    };

    const updateObjectRotation = (object: LayoutObject, rotation: number, record = true) => {
      const normalized = normalizeRotation(rotation);
      if (object.type === 'wall') {
        const snappedWall = snapWallSurfaceToGrid(
          { ...object, rotation: normalized },
          project.settings.gridSize,
          project.settings.snapEnabled,
          project.settings.orthogonalSnapEnabled,
        );
        updateObject(object.id, { x: snappedWall.x, y: snappedWall.y, depth: snappedWall.depth, width: snappedWall.width, rotation: snappedWall.rotation }, record);
        return;
      }
      updateObject(object.id, { rotation: normalized }, record);
    };

    const moveWallEndpointByKeyboard = (
      event: ReactKeyboardEvent<SVGElement>,
      wall: LayoutObject,
      endType: 'start' | 'end',
    ) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const endpoints = getWallEndpoints(wall);
      const moving = endType === 'start' ? endpoints.start : endpoints.end;
      const amount = event.shiftKey ? WALL_SNAP_STEP * 10 : WALL_SNAP_STEP;
      const candidate = {
        x: moving.x + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0),
        y: moving.y + (event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0),
      };
      const start = endType === 'start' ? candidate : endpoints.start;
      const end = endType === 'end' ? candidate : endpoints.end;
      if (Math.hypot(end.x - start.x, end.y - start.y) < 100) return;
      updateObject(wall.id, wallFromEndpoints(start, end, wall.depth, wall.wallSide));
    };

    const moveRoomVertexByKeyboard = (
      event: ReactKeyboardEvent<SVGElement>,
      vertexIndex: number,
      locked: boolean,
    ) => {
      if (locked || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const amount = event.shiftKey ? project.settings.gridSize * 10 : project.settings.gridSize;
      const source = project.room.vertices[vertexIndex];
      let candidate = {
        x: source.x + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0),
        y: source.y + (event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0),
      };
      if (project.settings.orthogonalSnapEnabled) {
        candidate = snapRoomVertexToOrthogonal(project.room.vertices, vertexIndex, candidate).point;
      }
      const vertices = project.room.vertices.map((point, index) => index === vertexIndex ? candidate : point);
      if (isValidRoomPolygon(vertices, Math.max(50, project.settings.gridSize))) updateRoomVertices(vertices);
    };

    const startRoomWallInteraction = (event: ReactPointerEvent<SVGElement>, wallIndex: number) => {
      if (activeTool !== 'walls' || event.button !== 0 || spacePressedRef.current || !svgRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus();
      if (activeTool === 'walls') selectRoomWall(wallIndex);
      const wallCount = project.room.vertices.length;
      const affectedWallIndices = [
        (wallIndex - 1 + wallCount) % wallCount,
        wallIndex,
        (wallIndex + 1) % wallCount,
      ];
      if (project.room.lockedWallIndices?.some((index) => affectedWallIndices.includes(index))) return;
      const startPoint = project.room.vertices[wallIndex];
      const endPoint = project.room.vertices[(wallIndex + 1) % project.room.vertices.length];
      const dx = endPoint.x - startPoint.x;
      const dy = endPoint.y - startPoint.y;
      const length = Math.hypot(dx, dy) || 1;
      beginHistory();
      interactionRef.current = {
        kind: 'room-wall',
        wallIndex,
        start: pointerInElement(event, svgRef.current),
        sourceVertices: project.room.vertices.map((point) => ({ ...point })),
        normal: { x: -dy / length, y: dx / length },
      };
      svgRef.current.setPointerCapture(event.pointerId);
    };

    const startRoomVertexInteraction = (event: ReactPointerEvent<SVGElement>, vertexIndex: number, wallIndex: number) => {
      if ((activeTool !== 'walls' && activeTool !== 'vertices') || event.button !== 0 || spacePressedRef.current || !svgRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus();
      if (activeTool === 'walls') selectRoomWall(wallIndex);
      const previousWallIndex = (vertexIndex - 1 + project.room.vertices.length) % project.room.vertices.length;
      if (project.room.lockedWallIndices?.some((index) => index === vertexIndex || index === previousWallIndex)) return;
      beginHistory();
      interactionRef.current = {
        kind: 'room-vertex',
        vertexIndex,
        start: pointerInElement(event, svgRef.current),
        sourceVertices: project.room.vertices.map((point) => ({ ...point })),
      };
      svgRef.current.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
      const interaction = interactionRef.current;
      const svg = svgRef.current;
      if (!interaction || !svg) return;
      const pointer = pointerInElement(event, svg);
      if (interaction.kind === 'pan') {
        setPan({
          x: interaction.sourcePan.x + pointer.x - interaction.start.x,
          y: interaction.sourcePan.y + pointer.y - interaction.start.y,
        });
        setDraggingCanvas(true);
        return;
      }
      if (interaction.kind === 'select-box') {
        interaction.current = pointer;
        setSelectionBox({ start: interaction.start, end: pointer });
        return;
      }
      if (interaction.kind === 'room-wall' || interaction.kind === 'room-vertex') {
        const deltaX = pxLengthToMm(pointer.x - interaction.start.x, zoom);
        const deltaY = pxLengthToMm(pointer.y - interaction.start.y, zoom);
        let vertices = interaction.sourceVertices.map((point) => ({ ...point }));
        if (interaction.kind === 'room-wall') {
          let distance = deltaX * interaction.normal.x + deltaY * interaction.normal.y;
          distance = snapToGrid(distance, project.settings.gridSize, project.settings.snapEnabled);
          vertices = moveRoomWallParallel(interaction.sourceVertices, interaction.wallIndex, distance);
          setReadout({ kind: 'position', text: `벽 이동 ${formatLength(distance)}`, point: pointer });
        } else {
          const source = interaction.sourceVertices[interaction.vertexIndex];
          const candidate = {
            x: snapToGrid(source.x + deltaX, project.settings.gridSize, project.settings.snapEnabled),
            y: snapToGrid(source.y + deltaY, project.settings.gridSize, project.settings.snapEnabled),
          };
          const orthogonalSnap = project.settings.orthogonalSnapEnabled && !event.altKey
            ? snapRoomVertexToOrthogonal(
              interaction.sourceVertices,
              interaction.vertexIndex,
              candidate,
              8,
              pxLengthToMm(14, zoom),
            )
            : { point: candidate, snapped: false };
          vertices[interaction.vertexIndex] = orthogonalSnap.point;
          setReadout({ kind: 'position', text: `X ${formatLength(orthogonalSnap.point.x)} · Y ${formatLength(orthogonalSnap.point.y)}${orthogonalSnap.snapped ? ' · 직각 스냅' : ''}`, point: pointer });
        }
        if (isValidRoomPolygon(vertices, Math.max(50, project.settings.gridSize))) updateRoomVertices(vertices, false);
        return;
      }
      if (interaction.kind === 'rotate') {
        const degrees = (Math.atan2(pointer.y - interaction.center.y, pointer.x - interaction.center.x) * 180) / Math.PI + 90;
        const rotation = normalizeRotation(Math.round(degrees / 15) * 15);
        updateObjectRotation(interaction.source, rotation, false);
        setReadout({ kind: 'rotation', text: `${rotation}°`, point: pointer });
        return;
      }
      const deltaX = pxLengthToMm(pointer.x - interaction.start.x, zoom);
      const deltaY = pxLengthToMm(pointer.y - interaction.start.y, zoom);
      const grid = project.settings.gridSize;
      if (interaction.kind === 'move') {
        const wall = interaction.source.type === 'wall';
        const rawX = interaction.source.x + deltaX;
        const rawY = interaction.source.y + deltaY;
        const others = project.objects.filter((object) => object.id !== interaction.objectId);
        const alignmentThreshold = Math.max(30, grid / 2);
        let x = wall ? rawX : snapToGrid(rawX, grid, project.settings.snapEnabled);
        let y = wall ? rawY : snapToGrid(rawY, grid, project.settings.snapEnabled);
        let nextGuides: AlignmentGuides = {};
        let furnitureWallCandidate: FurnitureWallSnapCandidate | null = null;

        if (furnitureWallSnapTypes.has(interaction.source.type)) {
          const resolution = resolveFurnitureDragPosition(
            interaction.source,
            rawX,
            rawY,
            others,
            {
              roomVertices: project.room.vertices,
              excludedWallIndices: project.room.removedWallIndices,
              gridSize: grid,
              snapEnabled: project.settings.snapEnabled,
              wallSnapEnabled: project.settings.objectSnapEnabled && !event.altKey,
              alignmentThreshold,
              supplementalWallSurfaces: getObjectWallSnapSurfaces(others),
            },
          );
          x = resolution.x;
          y = resolution.y;
          nextGuides = resolution.guides;
          furnitureWallCandidate = resolution.wallCandidate;
        } else if (project.settings.objectSnapEnabled && !event.altKey) {
          const aligned = alignObjectPosition(
            interaction.source,
            x,
            y,
            others,
            alignmentThreshold,
          );
          x = aligned.x;
          y = aligned.y;
          nextGuides = aligned.guides;
        }
        if (wall) {
          const snappedWall = snapWallSurfaceToGrid(
            { ...interaction.source, x, y },
            grid,
            project.settings.snapEnabled,
            project.settings.orthogonalSnapEnabled && !event.altKey,
          );
          x = snappedWall.x;
          y = snappedWall.y;
        }
        const wallPlacement = project.settings.objectSnapEnabled && !event.altKey && wallMountedTypes.has(interaction.source.type)
          ? snapObjectToWallSurfaces(
            { ...interaction.source, x, y },
            [
              ...getRoomWallSnapSurfaces(project.room.vertices, project.room.removedWallIndices, project.room.wallThicknesses),
              ...getObjectWallSnapSurfaces(project.objects, interaction.objectId),
            ],
          )
          : null;
        updateObject(interaction.objectId, wallPlacement ?? { x, y }, false, !event.altKey);
        const movedX = (wallPlacement?.x ?? x) - interaction.source.x;
        const movedY = (wallPlacement?.y ?? y) - interaction.source.y;
        interaction.groupSources.forEach((source) => updateObject(source.id, { x: source.x + movedX, y: source.y + movedY }, false, false));
        setWallSnapCandidate(furnitureWallCandidate);
        setGuides(nextGuides);
        const readoutX = wallPlacement?.x ?? x;
        const readoutY = wallPlacement?.y ?? y;
        setReadout({ kind: 'position', text: `X ${formatLength(readoutX)}  ·  Y ${formatLength(readoutY)}${furnitureWallCandidate ? '  ·  벽 맞춤' : ''}`, point: pointer });
        return;
      }
      if (interaction.kind === 'wall-endpoint') {
        const endpoints = getLinearWallEndpoints(interaction.source);
        const fixed = interaction.endType === 'start' ? endpoints.end : endpoints.start;
        const originalMoving = interaction.endType === 'start' ? endpoints.start : endpoints.end;
        let candidate = {
          x: snapToGrid(originalMoving.x + deltaX, project.settings.gridSize, project.settings.snapEnabled),
          y: snapToGrid(originalMoving.y + deltaY, project.settings.gridSize, project.settings.snapEnabled),
        };

        if (project.settings.orthogonalSnapEnabled && !event.altKey) {
          const dx = candidate.x - fixed.x; const dy = candidate.y - fixed.y;
          const length = Math.hypot(dx, dy) || 1;
          const threshold = Math.sin(8 * Math.PI / 180);
          if (Math.abs(dx) / length <= threshold) candidate.x = fixed.x;
          if (Math.abs(dy) / length <= threshold) candidate.y = fixed.y;
        }
        if (project.settings.objectSnapEnabled && !event.altKey) {
          const snapPoints = [
            ...project.room.vertices,
            ...project.objects.flatMap((object) => object.id !== interaction.objectId && (object.type === 'wall' || object.type === 'glass-wall') ? Object.values(getLinearWallEndpoints(object)) : []),
          ];
          const nearest = snapPoints.map((point) => ({ point, distance: Math.hypot(point.x - candidate.x, point.y - candidate.y) })).sort((a, b) => a.distance - b.distance)[0];
          if (nearest && nearest.distance <= pxLengthToMm(14, zoom)) candidate = { ...nearest.point };
        }

        let dx = candidate.x - fixed.x;
        let dy = candidate.y - fixed.y;
        let length = Math.hypot(dx, dy);
        if (length < 100) {
          const sourceDx = originalMoving.x - fixed.x;
          const sourceDy = originalMoving.y - fixed.y;
          const sourceLength = Math.hypot(sourceDx, sourceDy) || 1;
          dx = (sourceDx / sourceLength) * 100;
          dy = (sourceDy / sourceLength) * 100;
          candidate = { x: fixed.x + dx, y: fixed.y + dy };
          length = 100;
        }
        const start = interaction.endType === 'start' ? candidate : fixed;
        const end = interaction.endType === 'end' ? candidate : fixed;
        updateObject(interaction.objectId, linearWallFromEndpoints(interaction.source, start, end), false);
        setReadout({
          kind: 'size',
          text: formatLength(length),
          point: pointer,
        });
        return;
      }
      const resized = resizeRotatedObject(
        interaction.source,
        interaction.corner,
        { x: deltaX, y: deltaY },
        100,
        (value) => snapToGrid(value, grid, project.settings.snapEnabled),
      );
      updateObject(interaction.objectId, resized, false);
      setReadout({ kind: 'size', text: `${formatLength(resized.width)} × ${formatLength(resized.depth)}`, point: pointer });
    };

    const endInteraction = (event?: ReactPointerEvent<SVGSVGElement>) => {
      if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const interaction = interactionRef.current;
      if (interaction?.kind === 'select-box') {
        const start = screenToMm(interaction.start, view);
        const end = screenToMm(interaction.current, view);
        const box = { left: Math.min(start.x, end.x), right: Math.max(start.x, end.x), top: Math.min(start.y, end.y), bottom: Math.max(start.y, end.y) };
        const ids = project.objects.filter((object) => {
          const bounds = rotatedBounds(object);
          return bounds.right >= box.left && bounds.left <= box.right && bounds.bottom >= box.top && bounds.top <= box.bottom;
        }).map((object) => object.id);
        selectObject(null);
        ids.forEach((id, index) => selectObject(id, index > 0));
        setSelectionBox(null);
      }
      if (
        interaction?.kind === 'move' &&
        event?.type === 'pointerup' &&
        project.settings.objectSnapEnabled && !event.altKey &&
        furnitureWallSnapTypes.has(interaction.source.type)
      ) {
        const state = useLayoutStore.getState();
        const object = state.project.objects.find((item) => item.id === interaction.objectId);
        if (object) {
          const candidate = getFurnitureWallSnapCandidate(
            object,
            state.project.room.vertices,
            FURNITURE_WALL_SNAP_DISTANCE,
            state.project.room.removedWallIndices,
            getObjectWallSnapSurfaces(state.project.objects, object.id),
          );
          if (candidate) updateObject(object.id, { x: candidate.x, y: candidate.y }, false);
        }
      }
      if (interaction && !['pan', 'select-box'].includes(interaction.kind)) commitHistory();
      interactionRef.current = null;
      setGuides({});
      setWallSnapCandidate(null);
      setReadout(null);
      setDraggingCanvas(false);
    };

    useEffect(() => {
      const cancelInteraction = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        if (!interactionRef.current) {
          if (measurePoints.length) setMeasurePoints([]);
          return;
        }
        event.preventDefault();
        const interaction = interactionRef.current;
        if (interaction.kind === 'pan') setPan(interaction.sourcePan);
        else if (interaction.kind === 'select-box') setSelectionBox(null);
        else if (interaction.kind === 'room-wall' || interaction.kind === 'room-vertex') {
          updateRoomVertices(interaction.sourceVertices, false);
          cancelHistory();
        }
        else {
          updateObject(interaction.objectId, interaction.source, false);
          if (interaction.kind === 'move') interaction.groupSources.forEach((source) => updateObject(source.id, source, false));
          cancelHistory();
        }
        interactionRef.current = null;
        setGuides({});
        setWallSnapCandidate(null);
        setReadout(null);
        setDraggingCanvas(false);
      };
      window.addEventListener('keydown', cancelInteraction);
      return () => window.removeEventListener('keydown', cancelInteraction);
    }, [cancelHistory, measurePoints.length, setPan, updateObject, updateRoomVertices]);

    useEffect(() => {
      const onSpaceDown = (event: KeyboardEvent) => {
        if (event.code !== 'Space' || event.repeat) return;
        if (document.querySelector('dialog[open]')) return;
        const tag = (event.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SUMMARY') return;
        event.preventDefault();
        spacePressedRef.current = true;
        setSpacePressed(true);
      };
      const onSpaceUp = (event: KeyboardEvent) => {
        if (event.code !== 'Space') return;
        spacePressedRef.current = false;
        setSpacePressed(false);
      };
      const clearSpace = () => {
        spacePressedRef.current = false;
        setSpacePressed(false);
      };
      window.addEventListener('keydown', onSpaceDown);
      window.addEventListener('keyup', onSpaceUp);
      window.addEventListener('blur', clearSpace);
      return () => {
        window.removeEventListener('keydown', onSpaceDown);
        window.removeEventListener('keyup', onSpaceUp);
        window.removeEventListener('blur', clearSpace);
      };
    }, []);

    const clearObjectSelection = () => {
      selectObject(null);
      const activeElement = document.activeElement;
      if (activeElement instanceof Element && activeElement.matches('.layout-object, .handle-hit, .room-wall-hit-area, .room-wall-endpoint')) {
        (activeElement as HTMLElement).blur();
      }
    };

    const onCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
      const target = event.target as Element;
      const forcePan = spacePressedRef.current || event.button === 1 || activeTool === 'pan';
      const interactiveTarget = target.closest('.layout-object, .selection-layer, .layout-space, .room-wall-hit-area, .room-wall-endpoint');
      if (!svgRef.current || (event.button !== 0 && event.button !== 1) || (!forcePan && interactiveTarget)) return;
      event.preventDefault();
      wrapRef.current?.focus({ preventScroll: true });
      const start = pointerInElement(event, svgRef.current);
      if (!forcePan && activeTool === 'measure') {
        const point = screenToMm(start, view);
        setMeasurePoints((current) => current.length >= 2 ? [point] : [...current, point]);
        return;
      }
      if (!forcePan) {
        clearObjectSelection();
        interactionRef.current = { kind: 'select-box', start, current: start };
        setSelectionBox({ start, end: start });
      } else interactionRef.current = { kind: 'pan', start, sourcePan: { ...pan } };
      event.currentTarget.setPointerCapture(event.pointerId);
    };

    const onCanvasDoubleClick = (event: ReactPointerEvent<SVGSVGElement>) => {
      if (activeTool !== 'vertices' || !svgRef.current) return;
      const world = screenToMm(pointerInElement(event, svgRef.current), view);
      const distanceToSegment = (point: Point, start: Point, end: Point) => {
        const dx = end.x - start.x; const dy = end.y - start.y;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
        const nearest = { x: start.x + dx * t, y: start.y + dy * t };
        return { distance: Math.hypot(point.x - nearest.x, point.y - nearest.y), nearest };
      };
      const candidates = project.room.vertices.map((start, index) => ({ index, ...distanceToSegment(world, start, project.room.vertices[(index + 1) % project.room.vertices.length]) }));
      const candidate = candidates.sort((a, b) => a.distance - b.distance)[0];
      if (candidate && candidate.distance <= pxLengthToMm(20, zoom)) addRoomVertex(candidate.index, candidate.nearest);
    };

    const onWheel = (event: WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const pointer = pointerInElement(event, svg);
      const anchor = screenToMm(pointer, view);
      const nextZoom = clampZoom(zoom * (event.deltaY > 0 ? 0.9 : 1.1));
      const nextScale = BASE_PX_PER_MM * nextZoom;
      setView(nextZoom, { x: pointer.x - anchor.x * nextScale, y: pointer.y - anchor.y * nextScale });
    };

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/x-aiad-object') as LayoutObjectType;
      if (!(type in catalogByType) || !svgRef.current) return;
      const pointer = pointerInElement(event, svgRef.current);
      const world = screenToMm(pointer, view);
      const item = catalogByType[type];
      const placementStep = type === 'wall' ? WALL_SNAP_STEP : project.settings.gridSize;
      const id = addObject(type, {
        x: snapToGrid(world.x - item.width / 2, placementStep, project.settings.snapEnabled),
        y: snapToGrid(world.y - item.depth / 2, placementStep, project.settings.snapEnabled),
      });
      if (project.settings.objectSnapEnabled && !event.altKey && furnitureWallSnapTypes.has(type)) {
        const state = useLayoutStore.getState();
        const object = state.project.objects.find((item) => item.id === id);
        if (object) {
          const candidate = getFurnitureWallSnapCandidate(
            object,
            state.project.room.vertices,
            FURNITURE_WALL_SNAP_DISTANCE,
            state.project.room.removedWallIndices,
            getObjectWallSnapSurfaces(state.project.objects, object.id),
          );
          if (candidate) updateObject(id, { x: candidate.x, y: candidate.y }, false);
        }
      }
    };

    const roomPoints = project.room.vertices.map((point) => {
      const screen = mmToScreen(point, view);
      return `${screen.x},${screen.y}`;
    }).join(' ');
    const inwardSwingSign = roomInteriorSwingSign(project.room.vertices);
    const selected = project.objects.find((object) => object.id === selectedId);
    const rawGridStep = mmLengthToPx(project.settings.gridSize, zoom);
    const gridStep = rawGridStep;
    const gridX = ((pan.x % gridStep) + gridStep) % gridStep;
    const gridY = ((pan.y % gridStep) + gridStep) % gridStep;
    const majorGridStep = gridStep * 5;
    const majorGridX = ((pan.x % majorGridStep) + majorGridStep) % majorGridStep;
    const majorGridY = ((pan.y % majorGridStep) + majorGridStep) % majorGridStep;

    const sortedObjects = useMemo(() => {
      if (!selectedId) return project.objects;
      return [...project.objects].sort((a, b) => {
        if (a.id === selectedId) return 1;
        if (b.id === selectedId) return -1;
        return 0;
      });
    }, [project.objects, selectedId]);

    const roomWallSegments = useMemo(() => {
      return getRoomWallOuterSegments(project.room.vertices, project.room.removedWallIndices ?? [], project.room.wallThicknesses ?? WALL_THICKNESS);
    }, [project.room.vertices, project.room.removedWallIndices, project.room.wallThicknesses]);
    const roomSurfaceClosed = useMemo(() => isRoomBoundaryClosed(
      project.room.vertices,
      project.room.removedWallIndices ?? [],
      project.objects.filter((object) => object.type === 'wall').map((wall) => ({
        ...getWallEndpoints(wall),
        thickness: wall.depth,
      })),
    ), [project.objects, project.room.removedWallIndices, project.room.vertices]);
    const objectWallLoops = useMemo(() => getClosedWallLoops(project.objects), [project.objects]);
    const wallJoinPolygons = useMemo(() => {
      const roomWalls = getRoomWallFaceGeometries(
        project.room.vertices,
        project.room.removedWallIndices ?? [],
        project.room.wallThicknesses ?? WALL_THICKNESS,
      );
      const objectWalls = project.objects.flatMap((object) => {
        const geometry = getObjectWallFaceGeometry(object);
        return geometry ? [geometry] : [];
      });
      return getWallJoinPolygons([...roomWalls, ...objectWalls]);
    }, [project.objects, project.room.removedWallIndices, project.room.vertices, project.room.wallThicknesses]);

    return (
      <section className="canvas-column">
        <header className="canvas-info-bar">
          <div><strong>{project.room.name}</strong><span>{project.objects.length}개 객체</span></div>
          <div className="canvas-info-bar__hint"><span>빈 공간 드래그로 영역 선택</span><kbd>Space</kbd><span>이동</span><kbd>휠</kbd><span>확대·축소</span></div>
          <button className={`warning-counter ${warnings.length ? 'has-warning' : ''}`} onClick={onOpenWarnings}><Icon name="warning" size={15} />배치 경고 {warnings.length}건<Icon name="chevron-right" size={14} /></button>
        </header>
        <div
          className={`canvas-wrap ${spacePressed ? 'is-pan-ready' : ''} ${draggingCanvas ? 'is-panning' : ''}`}
          ref={wrapRef}
          tabIndex={0}
          aria-label="연구실 2D 배치 작업 영역"
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <div className="canvas-tool-palette" role="toolbar" aria-label="도면 편집 도구">
            {([
              ['select', '선택', 'V'], ['pan', '이동', 'H'], ['measure', '거리 측정', 'M'], ['vertices', '꼭짓점', 'N'], ['walls', '벽 편집', 'W'],
            ] as const).map(([tool, label, shortcut]) => <button key={tool} className={activeTool === tool ? 'is-active' : ''} type="button" aria-keyshortcuts={shortcut} onClick={() => { setActiveTool(tool); if (tool !== 'measure') setMeasurePoints([]); }} title={`${label} (${shortcut})`}><span>{label}</span><kbd>{shortcut}</kbd></button>)}
          </div>
          <svg
            ref={svgRef}
            className="layout-canvas"
            width={size.width}
            height={size.height}
            onPointerDown={onCanvasPointerDown}
            onDoubleClick={onCanvasDoubleClick}
            onPointerMove={onPointerMove}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
            onContextMenu={(event) => event.preventDefault()}
            onWheel={onWheel}
            aria-label="연구실 2D 배치 캔버스"
          >
            <defs>
              <clipPath id="room-space-clip"><polygon points={roomPoints} /></clipPath>
              <pattern id="editor-grid" x={gridX} y={gridY} width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
                <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" stroke="#e8ebef" strokeWidth="1" />
              </pattern>
              <pattern id="editor-grid-major" x={majorGridX} y={majorGridY} width={majorGridStep} height={majorGridStep} patternUnits="userSpaceOnUse">
                <path d={`M ${majorGridStep} 0 L 0 0 0 ${majorGridStep}`} fill="none" stroke="#e8ebef" strokeWidth="1.35" />
              </pattern>
            </defs>
            <rect width={size.width} height={size.height} fill="#f6f7f9" pointerEvents="none" />
            {project.settings.showGrid && <><rect width={size.width} height={size.height} fill="url(#editor-grid)" pointerEvents="none" /><rect width={size.width} height={size.height} fill="url(#editor-grid-major)" pointerEvents="none" /></>}
            <rect className="canvas-hit-area" width={size.width} height={size.height} fill="transparent" />
            {roomSurfaceClosed && <polygon className="room-surface" points={roomPoints} fill="#fff" stroke="none" />}
            <g clipPath="url(#room-space-clip)" className="layout-spaces">
              {(project.room.spaces ?? []).map((space) => {
                const origin = mmToScreen({ x: space.bounds.x, y: space.bounds.y }, view);
                return <g key={space.id} className={`layout-space layout-space--${space.type} ${selectedSpaceId === space.id ? 'is-selected' : ''}`} role="button" tabIndex={0} aria-label={`공간 ${space.name}`} onPointerDown={(event) => { event.stopPropagation(); selectSpace(space.id); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectSpace(space.id); } }}>
                  <rect x={origin.x} y={origin.y} width={space.bounds.width * scale} height={space.bounds.depth * scale} />
                  <text x={origin.x + 12} y={origin.y + 22}>{space.name}</text>
                </g>;
              })}
            </g>
            {objectWallLoops.map((loop, index) => (
              <polygon
                key={`object-room-surface-${index}`}
                className="room-surface"
                points={loop.map((point) => {
                  const screenPoint = mmToScreen(point, view);
                  return `${screenPoint.x},${screenPoint.y}`;
                }).join(' ')}
                fill="#fff"
                stroke="none"
              />
            ))}
            {roomWallSegments.map((segment, index) => {
              if (!segment) return null;
              const inStart = mmToScreen(segment.inStart, view);
              const inEnd = mmToScreen(segment.inEnd, view);
              const outStart = mmToScreen(segment.outStart, view);
              const outEnd = mmToScreen(segment.outEnd, view);

              const polyPoints = `${inStart.x},${inStart.y} ${inEnd.x},${inEnd.y} ${outEnd.x},${outEnd.y} ${outStart.x},${outStart.y}`;

              return (
                <polygon
                  key={`room-wall-poly-${index}`}
                  className="room-wall"
                  points={polyPoints}
                  fill={WALL_COLOR}
                  stroke={WALL_COLOR}
                  strokeWidth="0.5"
                />
              );
            })}
            {wallJoinPolygons.map((polygon, index) => (
              <polygon
                key={`wall-join-${index}`}
                className="wall-join"
                points={polygon.map((point) => {
                  const screenPoint = mmToScreen(point, view);
                  return `${screenPoint.x},${screenPoint.y}`;
                }).join(' ')}
                fill={WALL_COLOR}
                stroke={WALL_COLOR}
                strokeWidth="0.5"
                pointerEvents="none"
              />
            ))}
            {project.settings.showDimensions && (project.room.dimensions ?? []).map((dimension) => {
              const start = mmToScreen(dimension.start, view); const end = mmToScreen(dimension.end, view);
              const middle = { x: (start.x + end.x) / 2 + (dimension.labelOffsetX ?? 0) * scale, y: (start.y + end.y) / 2 + (dimension.labelOffsetY ?? 0) * scale };
              const angle = Math.atan2(end.y - start.y, end.x - start.x); const tick = 7;
              const tx = Math.cos(angle + Math.PI / 2) * tick; const ty = Math.sin(angle + Math.PI / 2) * tick;
              return <g key={dimension.id} className="official-dimension" pointerEvents="none"><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} /><line x1={start.x - tx} y1={start.y - ty} x2={start.x + tx} y2={start.y + ty} /><line x1={end.x - tx} y1={end.y - ty} x2={end.x + tx} y2={end.y + ty} /><text x={middle.x} y={middle.y} textAnchor="middle">{dimension.label ?? formatLength(Math.hypot(dimension.end.x - dimension.start.x, dimension.end.y - dimension.start.y))}</text></g>;
            })}
            {project.room.vertices.map((startPoint, index) => {
              if (project.room.removedWallIndices?.includes(index)) return null;
              const endPoint = project.room.vertices[(index + 1) % project.room.vertices.length];
              const start = mmToScreen(startPoint, view);
              const end = mmToScreen(endPoint, view);
              const length = Math.round(Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y));
              const isSelected = selectedRoomWallIndex === index;
              const isLocked = project.room.lockedWallIndices?.includes(index) ?? false;
              const previousWallIndex = (index - 1 + project.room.vertices.length) % project.room.vertices.length;
              const nextWallIndex = (index + 1) % project.room.vertices.length;
              const startEndpointLocked = isLocked || (project.room.lockedWallIndices?.includes(previousWallIndex) ?? false);
              const endEndpointLocked = isLocked || (project.room.lockedWallIndices?.includes(nextWallIndex) ?? false);
              const movementLocked = startEndpointLocked || endEndpointLocked;
              const screenLength = Math.hypot(end.x - start.x, end.y - start.y) || 1;
              const wallThickness = project.room.wallThicknesses?.[index] ?? WALL_THICKNESS;
              const halfHitWidth = Math.max(18, wallThickness * scale + 10) / 2;
              const normal = {
                x: -(end.y - start.y) / screenLength * halfHitWidth,
                y: (end.x - start.x) / screenLength * halfHitWidth,
              };
              const hitPoints = [
                `${start.x + normal.x},${start.y + normal.y}`,
                `${end.x + normal.x},${end.y + normal.y}`,
                `${end.x - normal.x},${end.y - normal.y}`,
                `${start.x - normal.x},${start.y - normal.y}`,
              ].join(' ');
              return (
                <g key={`room-wall-${index}`} className={`room-wall-segment ${isLocked ? 'is-locked' : ''} ${movementLocked ? 'is-movement-locked' : ''}`}>
                  <polygon
                    className="room-wall-hit-area"
                    points={hitPoints}
                    role="button"
                    tabIndex={activeTool === 'walls' ? 0 : -1}
                    aria-label={`벽 ${index + 1}, ${formatLength(length)}${isLocked ? ', 잠김' : ''}`}
                    aria-pressed={isSelected}
                    pointerEvents={activeTool === 'walls' ? 'auto' : 'none'}
                    onFocus={() => { if (activeTool === 'walls') selectRoomWall(index); }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      selectRoomWall(index);
                    }}
                    onPointerDown={(event) => startRoomWallInteraction(event, index)}
                  />
                </g>
              );
            })}
            {wallSnapCandidate && (() => {
              const start = mmToScreen(wallSnapCandidate.wallStart, view);
              const end = mmToScreen(wallSnapCandidate.wallEnd, view);
              return <line className="wall-snap-guide" x1={start.x} y1={start.y} x2={end.x} y2={end.y} />;
            })()}
            {sortedObjects.map((object) => {
              const origin = mmToScreen({ x: object.x, y: object.y }, view);
              const width = object.width * scale;
              const depth = object.depth * scale;
              const center = { x: origin.x + width / 2, y: origin.y + depth / 2 };
              const warning = warningIds.has(object.id);
              return (
                <g
                  key={object.id}
                  className={`layout-object ${selectedIds.includes(object.id) ? 'is-selected' : ''} ${warning ? 'has-warning' : ''} ${object.locked ? 'is-locked' : ''}`}
                  transform={`rotate(${object.rotation} ${center.x} ${center.y})`}
                  style={{
                    opacity: object.opacity ?? 1,
                    pointerEvents: (object.type === 'wall' || object.type === 'glass-wall')
                      ? activeTool === 'walls' ? 'auto' : 'none'
                      : activeTool === 'walls' ? 'none' : 'auto',
                  }}
                  onPointerDown={(event) => startObjectInteraction(event, object, 'move')}
                  onFocus={() => {
                    const isWall = object.type === 'wall' || object.type === 'glass-wall';
                    if (((isWall && activeTool === 'walls') || (!isWall && activeTool !== 'walls')) && !selectedIds.includes(object.id)) selectObject(object.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectObject(object.id);
                    }
                  }}
                  role="button"
                  tabIndex={(object.type === 'wall' || object.type === 'glass-wall') ? activeTool === 'walls' ? 0 : -1 : activeTool === 'walls' ? -1 : 0}
                  aria-pressed={selectedIds.includes(object.id)}
                  aria-label={`${object.name}, ${formatLength(object.width)} × ${formatLength(object.depth)}`}
                >
                  <g>
                    <rect
                      className="layout-object-hit-area"
                      x={origin.x + (width - Math.max(width, 36)) / 2}
                      y={origin.y + (depth - Math.max(depth, 36)) / 2}
                      width={Math.max(width, 36)}
                      height={Math.max(depth, 36)}
                    />
                    <PlanSymbol
                      type={object.type}
                      x={origin.x}
                      y={origin.y}
                      width={width}
                      height={depth}
                      doorHinge={object.doorHinge}
                      doorOpeningAngle={object.doorOpeningAngle}
                      doorSwingSign={(object.doorSwing ?? 'inward') === 'inward' ? inwardSwingSign : inwardSwingSign === 1 ? -1 : 1}
                    />
                    {warning && <><rect className="object-warning-overlay" x={origin.x - 3} y={origin.y - 3} width={width + 6} height={depth + 6} rx={5} /><circle className="object-warning-badge" cx={origin.x + width + 5} cy={origin.y - 5} r={8} /><text className="object-warning-mark" x={origin.x + width + 5} y={origin.y - 1} textAnchor="middle">!</text></>}
                    {project.settings.showLabels && width >= 72 && depth >= 36 && <text className="object-label" x={center.x} y={center.y} textAnchor="middle" dominantBaseline="middle">{object.name}</text>}
                    {object.locked && <g transform={`translate(${origin.x + 5} ${origin.y + 5})`} className="svg-lock"><rect width="17" height="17" rx="3" /><path d="M5 8V6a3.5 3.5 0 0 1 7 0v2M4 8h9v7H4z" /></g>}
                  </g>
                </g>
              );
            })}
            {selectedRoomWallIndex !== null && !project.room.removedWallIndices?.includes(selectedRoomWallIndex) && (() => {
              const index = selectedRoomWallIndex;
              const startPoint = project.room.vertices[index];
              const endPoint = project.room.vertices[(index + 1) % project.room.vertices.length];
              const start = mmToScreen(startPoint, view);
              const end = mmToScreen(endPoint, view);
              const isLocked = project.room.lockedWallIndices?.includes(index) ?? false;
              const previousWallIndex = (index - 1 + project.room.vertices.length) % project.room.vertices.length;
              const nextWallIndex = (index + 1) % project.room.vertices.length;
              const startEndpointLocked = isLocked || (project.room.lockedWallIndices?.includes(previousWallIndex) ?? false);
              const endEndpointLocked = isLocked || (project.room.lockedWallIndices?.includes(nextWallIndex) ?? false);
              return (
                <g key={`room-wall-selection-${index}`} className="room-wall-selection-layer">
                  <line className="room-wall-selection" x1={start.x} y1={start.y} x2={end.x} y2={end.y} strokeWidth={Math.max(5, (project.room.wallThicknesses?.[index] ?? WALL_THICKNESS) * scale) + 5} pointerEvents="none" />
                  <circle
                    className="room-wall-endpoint-hit"
                    cx={start.x}
                    cy={start.y}
                    r={18}
                    role="button"
                    tabIndex={0}
                    aria-label={`벽 ${index + 1} 시작점 이동${startEndpointLocked ? ', 잠김' : ''}`}
                    aria-disabled={startEndpointLocked}
                    data-locked={startEndpointLocked || undefined}
                    onKeyDown={(event) => moveRoomVertexByKeyboard(event, index, startEndpointLocked)}
                    onPointerDown={(event) => startRoomVertexInteraction(event, index, index)}
                  />
                  <circle
                    className="room-wall-endpoint"
                    cx={start.x}
                    cy={start.y}
                    r={6}
                    pointerEvents="none"
                  />
                  <circle
                    className="room-wall-endpoint-hit"
                    cx={end.x}
                    cy={end.y}
                    r={18}
                    role="button"
                    tabIndex={0}
                    aria-label={`벽 ${index + 1} 끝점 이동${endEndpointLocked ? ', 잠김' : ''}`}
                    aria-disabled={endEndpointLocked}
                    data-locked={endEndpointLocked || undefined}
                    onKeyDown={(event) => moveRoomVertexByKeyboard(event, (index + 1) % project.room.vertices.length, endEndpointLocked)}
                    onPointerDown={(event) => startRoomVertexInteraction(event, (index + 1) % project.room.vertices.length, index)}
                  />
                  <circle className="room-wall-endpoint" cx={end.x} cy={end.y} r={6} pointerEvents="none" />
                </g>
              );
            })()}
            {activeTool === 'vertices' && project.room.vertices.map((point, index) => {
              const screen = mmToScreen(point, view);
              const locked = project.room.lockedWallIndices?.includes(index) || project.room.lockedWallIndices?.includes((index - 1 + project.room.vertices.length) % project.room.vertices.length);
              return <g key={`vertex-tool-${index}`}>
                <circle className="room-vertex-tool-hit" cx={screen.x} cy={screen.y} r={18} role="button" tabIndex={locked ? -1 : 0} aria-label={`외곽 꼭짓점 ${index + 1} 이동${locked ? ', 잠김' : ''}`} aria-disabled={locked} data-locked={locked || undefined} onKeyDown={(event) => moveRoomVertexByKeyboard(event, index, Boolean(locked))} onPointerDown={(event) => startRoomVertexInteraction(event, index, index)} />
                <circle className="room-vertex-tool" cx={screen.x} cy={screen.y} r={5} data-locked={locked || undefined} pointerEvents="none" />
              </g>;
            })}
            {guides.x !== undefined && <line className="alignment-guide" x1={mmToScreen({ x: guides.x, y: 0 }, view).x} x2={mmToScreen({ x: guides.x, y: 0 }, view).x} y1={0} y2={size.height} />}
            {guides.y !== undefined && <line className="alignment-guide" y1={mmToScreen({ x: 0, y: guides.y }, view).y} y2={mmToScreen({ x: 0, y: guides.y }, view).y} x1={0} x2={size.width} />}
            {selected && (() => {
              const origin = mmToScreen({ x: selected.x, y: selected.y }, view);
              const width = selected.width * scale;
              const depth = selected.depth * scale;
              const center = { x: origin.x + width / 2, y: origin.y + depth / 2 };
              const corners: Record<Corner, Point> = {
                nw: origin,
                ne: { x: origin.x + width, y: origin.y },
                se: { x: origin.x + width, y: origin.y + depth },
                sw: { x: origin.x, y: origin.y + depth },
              };
              const calloutWidth = 144;
              const calloutHeight = 23;
              const dimensionCandidates = [
                { x: center.x - calloutWidth / 2, y: origin.y + depth + 12 },
                { x: center.x - calloutWidth / 2, y: origin.y - calloutHeight - 12 },
                { x: origin.x + width + 12, y: center.y - calloutHeight / 2 },
                { x: origin.x - calloutWidth - 12, y: center.y - calloutHeight / 2 },
              ];
              const rotationRadians = selected.rotation * Math.PI / 180;
              const rotateScreenPoint = (point: Point) => ({
                x: center.x + (point.x - center.x) * Math.cos(rotationRadians) - (point.y - center.y) * Math.sin(rotationRadians),
                y: center.y + (point.x - center.x) * Math.sin(rotationRadians) + (point.y - center.y) * Math.cos(rotationRadians),
              });
              const calloutBounds = (position: Point) => {
                const points = [
                  position,
                  { x: position.x + calloutWidth, y: position.y },
                  { x: position.x + calloutWidth, y: position.y + calloutHeight },
                  { x: position.x, y: position.y + calloutHeight },
                ].map(rotateScreenPoint);
                return {
                  left: Math.min(...points.map((point) => point.x)),
                  right: Math.max(...points.map((point) => point.x)),
                  top: Math.min(...points.map((point) => point.y)),
                  bottom: Math.max(...points.map((point) => point.y)),
                };
              };
              const occupiedBounds = project.objects.flatMap((object) => {
                if (object.id === selected.id) return [];
                const bounds = rotatedBounds(object);
                const topLeft = mmToScreen({ x: bounds.left, y: bounds.top }, view);
                return [{
                  left: topLeft.x - 8,
                  right: topLeft.x + bounds.width * scale + 8,
                  top: topLeft.y - 8,
                  bottom: topLeft.y + bounds.height * scale + 8,
                }];
              });
              const overlapArea = (
                first: { left: number; right: number; top: number; bottom: number },
                second: { left: number; right: number; top: number; bottom: number },
              ) => Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
                * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
              const dimensionPosition = dimensionCandidates
                .map((position, index) => {
                  const bounds = calloutBounds(position);
                  const outside = Math.max(0, 8 - bounds.left)
                    + Math.max(0, bounds.right - size.width + 8)
                    + Math.max(0, 8 - bounds.top)
                    + Math.max(0, bounds.bottom - size.height + 8);
                  const overlap = occupiedBounds.reduce((total, occupied) => total + overlapArea(bounds, occupied), 0);
                  return { position, score: outside * 100000 + overlap, index };
                })
                .sort((first, second) => first.score - second.score || first.index - second.index)[0].position;
              return (
                <g transform={`rotate(${selected.rotation} ${center.x} ${center.y})`} className="selection-layer">
                  {selected.type === 'door' && <path
                    className="door-selection-area"
                    d={doorSwingPath({
                      x: origin.x,
                      y: origin.y,
                      width,
                      height: depth,
                      doorHinge: selected.doorHinge,
                      doorSwingSign: (selected.doorSwing ?? 'inward') === 'inward' ? inwardSwingSign : inwardSwingSign === 1 ? -1 : 1,
                      openingAngle: selected.doorOpeningAngle,
                    }).sector}
                  />}
                  <rect x={origin.x} y={origin.y} width={width} height={depth} className="selection-box" />
                  {!selected.locked && selected.type !== 'wall' && selected.type !== 'glass-wall' && selected.type !== 'door' && selected.type !== 'window' && Object.entries(corners).map(([corner, point]) => (
                    <g key={corner}><circle cx={point.x} cy={point.y} r={18} className="handle-hit" role="button" tabIndex={0} aria-label={`${corner.toUpperCase()} 모서리 크기 조절`} onFocus={() => selectObject(selected.id)} onKeyDown={(event) => {
                      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                      event.preventDefault();
                      const targetCorner = corner as Corner;
                      const amount = project.settings.gridSize;
                      let nextX = selected.x;
                      let nextY = selected.y;
                      let nextWidth = selected.width;
                      let nextDepth = selected.depth;
                      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                        const delta = event.key === 'ArrowLeft' ? -amount : amount;
                        if (targetCorner.includes('w')) {
                          nextWidth = Math.max(100, selected.width - delta);
                          nextX = selected.x + selected.width - nextWidth;
                        } else nextWidth = Math.max(100, selected.width + delta);
                      } else {
                        const delta = event.key === 'ArrowUp' ? -amount : amount;
                        if (targetCorner.includes('n')) {
                          nextDepth = Math.max(100, selected.depth - delta);
                          nextY = selected.y + selected.depth - nextDepth;
                        } else nextDepth = Math.max(100, selected.depth + delta);
                      }
                      updateObject(selected.id, { x: nextX, y: nextY, width: nextWidth, depth: nextDepth });
                    }} onPointerDown={(event) => startObjectInteraction(event, selected, 'resize', corner as Corner)} /><circle cx={point.x} cy={point.y} r={5} className="resize-handle" pointerEvents="none" /></g>
                  ))}
                  {!selected.locked && (selected.type === 'wall' || selected.type === 'glass-wall') && activeTool === 'walls' && (() => {
                    const resizeCursor = selected.rotation % 180 === 0 ? 'ew-resize' : 'ns-resize';
                    const handleHalfHeight = Math.max(10, depth / 2 + 4);
                    const handleTop = center.y - handleHalfHeight;
                    const handleBottom = center.y + handleHalfHeight;
                    return <>
                    <g>
                      <rect x={origin.x - 14} y={origin.y - 8} width={28} height={depth + 16} rx={5} className="handle-hit wall-length-hit" style={{ cursor: resizeCursor }} role="button" tabIndex={0} aria-label="벽 시작 방향 길이 조절" onFocus={() => selectObject(selected.id)} onKeyDown={(event) => moveWallEndpointByKeyboard(event, selected, 'start')} onPointerDown={(event) => startObjectInteraction(event, selected, 'wall-endpoint', undefined, 'start')} />
                      <path d={`M ${origin.x + 6} ${handleTop} H ${origin.x} V ${handleBottom} H ${origin.x + 6}`} className="wall-length-handle" style={{ cursor: resizeCursor }} pointerEvents="none" />
                    </g>
                    <g>
                      <rect x={origin.x + width - 14} y={origin.y - 8} width={28} height={depth + 16} rx={5} className="handle-hit wall-length-hit" style={{ cursor: resizeCursor }} role="button" tabIndex={0} aria-label="벽 끝 방향 길이 조절" onFocus={() => selectObject(selected.id)} onKeyDown={(event) => moveWallEndpointByKeyboard(event, selected, 'end')} onPointerDown={(event) => startObjectInteraction(event, selected, 'wall-endpoint', undefined, 'end')} />
                      <path d={`M ${origin.x + width - 6} ${handleTop} H ${origin.x + width} V ${handleBottom} H ${origin.x + width - 6}`} className="wall-length-handle" style={{ cursor: resizeCursor }} pointerEvents="none" />
                    </g>
                  </>})()}
                  {!selected.locked && selected.type !== 'door' && selected.type !== 'window' && selected.type !== 'wall' && selected.type !== 'glass-wall' && <><line x1={center.x} y1={origin.y} x2={center.x} y2={origin.y - 24} className="rotation-stem" /><circle cx={center.x} cy={origin.y - 30} r={18} className="handle-hit rotation-hit" role="button" tabIndex={0} aria-label="회전 조절" onFocus={() => selectObject(selected.id)} onKeyDown={(event) => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -15 : 15; updateObjectRotation(selected, selected.rotation + direction); }} onPointerDown={(event) => startObjectInteraction(event, selected, 'rotate')} /><circle cx={center.x} cy={origin.y - 30} r={6} className="rotation-handle" pointerEvents="none" /></>}
                  {project.settings.showDimensions && <g className="selection-dimensions"><rect x={dimensionPosition.x} y={dimensionPosition.y} width={calloutWidth} height={calloutHeight} rx={4} /><text x={dimensionPosition.x + calloutWidth / 2} y={dimensionPosition.y + 16} textAnchor="middle">{selected.type === 'wall' ? formatLength(selected.width) : `${formatLength(selected.width)} × ${formatLength(selected.depth)}`}</text></g>}
                </g>
              );
            })()}
            {readout && <g className="interaction-readout" transform={`translate(${Math.min(size.width - 240, readout.point.x + 14)} ${Math.max(32, readout.point.y - 38)})`}><rect width={readout.kind === 'position' ? 225 : 170} height={30} rx={5} /><text x={10} y={20}>{readout.text}</text></g>}
            {selectionBox && <rect className="area-selection-box" x={Math.min(selectionBox.start.x, selectionBox.end.x)} y={Math.min(selectionBox.start.y, selectionBox.end.y)} width={Math.abs(selectionBox.end.x - selectionBox.start.x)} height={Math.abs(selectionBox.end.y - selectionBox.start.y)} />}
            {activeTool === 'measure' && <rect className="measurement-hit-area" width={size.width} height={size.height} fill="transparent" />}
            {measurePoints.length > 0 && <g className="measurement-layer" pointerEvents="none">
              {measurePoints.length === 2 && <line x1={mmToScreen(measurePoints[0], view).x} y1={mmToScreen(measurePoints[0], view).y} x2={mmToScreen(measurePoints[1], view).x} y2={mmToScreen(measurePoints[1], view).y} />}
              {measurePoints.map((point, index) => { const screen = mmToScreen(point, view); return <circle key={index} cx={screen.x} cy={screen.y} r={5} />; })}
              {measurePoints.length === 2 && (() => { const first = mmToScreen(measurePoints[0], view); const second = mmToScreen(measurePoints[1], view); const length = Math.hypot(measurePoints[1].x - measurePoints[0].x, measurePoints[1].y - measurePoints[0].y); return <g transform={`translate(${(first.x + second.x) / 2} ${(first.y + second.y) / 2 - 12})`}><rect x={-58} y={-17} width={116} height={24} rx={4} /><text textAnchor="middle">{formatLength(length)}</text></g>; })()}
            </g>}
          </svg>
          <div className="canvas-scale-indicator"><span style={{ width: `${mmLengthToPx(1000, zoom)}px` }} />축척 {formatLength(1000)}</div>
        </div>
      </section>
    );
  },
);
