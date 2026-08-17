export function snapToGrid(value: number, gridSize: number, enabled = true): number {
  if (!enabled || gridSize <= 0) return Math.round(value);
  return Math.round(value / gridSize) * gridSize;
}

export function normalizeRotation(value: number): number {
  return ((Math.round(value) % 360) + 360) % 360;
}
