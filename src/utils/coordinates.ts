import type { LayoutObject, Point, ViewState } from '../types/layout';

export const BASE_PX_PER_MM = 0.08;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;

export function mmToScreen(point: Point, view: ViewState): Point {
  const scale = BASE_PX_PER_MM * view.zoom;
  return {
    x: point.x * scale + view.pan.x,
    y: point.y * scale + view.pan.y,
  };
}

export function screenToMm(point: Point, view: ViewState): Point {
  const scale = BASE_PX_PER_MM * view.zoom;
  return {
    x: (point.x - view.pan.x) / scale,
    y: (point.y - view.pan.y) / scale,
  };
}

export function mmLengthToPx(value: number, zoom: number): number {
  return value * BASE_PX_PER_MM * zoom;
}

export function pxLengthToMm(value: number, zoom: number): number {
  return value / (BASE_PX_PER_MM * zoom);
}

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function rotatedBounds(object: LayoutObject) {
  const radians = (object.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = object.width * cos + object.depth * sin;
  const height = object.width * sin + object.depth * cos;
  const centerX = object.x + object.width / 2;
  const centerY = object.y + object.depth / 2;
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
    width,
    height,
    centerX,
    centerY,
  };
}

export function resizeRotatedObject(
  object: LayoutObject,
  corner: 'nw' | 'ne' | 'se' | 'sw',
  worldDelta: Point,
  minimumSize: number,
  snapSize: (value: number) => number,
): Pick<LayoutObject, 'x' | 'y' | 'width' | 'depth'> {
  const radians = object.rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const localDelta = {
    x: worldDelta.x * cos + worldDelta.y * sin,
    y: -worldDelta.x * sin + worldDelta.y * cos,
  };
  const east = corner.includes('e');
  const south = corner.includes('s');
  const rawWidth = east ? object.width + localDelta.x : object.width - localDelta.x;
  const rawDepth = south ? object.depth + localDelta.y : object.depth - localDelta.y;
  const width = Math.max(minimumSize, snapSize(Math.max(minimumSize, rawWidth)));
  const depth = Math.max(minimumSize, snapSize(Math.max(minimumSize, rawDepth)));
  const localCenterShift = {
    x: (east ? 1 : -1) * (width - object.width) / 2,
    y: (south ? 1 : -1) * (depth - object.depth) / 2,
  };
  const worldCenterShift = {
    x: localCenterShift.x * cos - localCenterShift.y * sin,
    y: localCenterShift.x * sin + localCenterShift.y * cos,
  };
  const center = {
    x: object.x + object.width / 2 + worldCenterShift.x,
    y: object.y + object.depth / 2 + worldCenterShift.y,
  };
  return { x: center.x - width / 2, y: center.y - depth / 2, width, depth };
}

export function roomBounds(vertices: Point[]) {
  const xs = vertices.map((point) => point.x);
  const ys = vertices.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function formatMillimeters(value: number, unit: 'mm' | 'cm' | 'm' = 'mm'): string {
  const scale = unit === 'mm' ? 1 : unit === 'cm' ? 10 : 1000;
  const digits = unit === 'mm' ? 0 : unit === 'cm' ? 1 : 2;
  return `${(value / scale).toLocaleString('ko-KR', { maximumFractionDigits: digits })} ${unit}`;
}
