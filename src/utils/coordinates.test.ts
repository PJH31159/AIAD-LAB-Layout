import { describe, expect, it } from 'vitest';
import { mmToScreen, resizeRotatedObject, screenToMm } from './coordinates';
import { normalizeRotation, snapToGrid } from './snapping';

describe('좌표 변환', () => {
  it('mm 좌표를 화면 좌표로 변환한 뒤 원래 값으로 복원합니다.', () => {
    const view = { zoom: 1.35, pan: { x: 180, y: -45 } };
    const point = { x: 2350, y: 1800 };
    const restored = screenToMm(mmToScreen(point, view), view);
    expect(restored.x).toBeCloseTo(point.x);
    expect(restored.y).toBeCloseTo(point.y);
  });

  it('격자 스냅은 mm 값에 적용됩니다.', () => {
    expect(snapToGrid(2349, 100)).toBe(2300);
    expect(snapToGrid(2351, 100)).toBe(2400);
    expect(snapToGrid(2351, 100, false)).toBe(2351);
  });

  it('회전값을 0 이상 360 미만으로 정규화합니다.', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
  });

  it('회전 객체 크기 조절은 반대쪽 모서리를 고정하고 로컬 축으로 계산합니다.', () => {
    const object = { id: 'desk', type: 'desk' as const, name: '책상', x: 100, y: 200, width: 400, depth: 200, rotation: 90, locked: false };
    const resized = resizeRotatedObject(object, 'se', { x: -100, y: 200 }, 100, (value) => value);
    expect(resized).toEqual({ x: -50, y: 250, width: 600, depth: 300 });
    const rotatedNorthWest = (value: typeof object | (typeof resized & Pick<typeof object, 'rotation'>)) => {
      const center = { x: value.x + value.width / 2, y: value.y + value.depth / 2 };
      const radians = value.rotation * Math.PI / 180;
      return {
        x: center.x + (value.x - center.x) * Math.cos(radians) - (value.y - center.y) * Math.sin(radians),
        y: center.y + (value.x - center.x) * Math.sin(radians) + (value.y - center.y) * Math.cos(radians),
      };
    };
    const before = rotatedNorthWest(object);
    const after = rotatedNorthWest({ ...resized, rotation: object.rotation });
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});
