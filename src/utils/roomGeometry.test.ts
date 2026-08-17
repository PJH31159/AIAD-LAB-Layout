import { describe, expect, it } from 'vitest';
import {
  getInteriorWallLength,
  getRoomWallCenterline,
  getRoomWallOuterSegments,
  isRoomBoundaryClosed,
  isValidRoomPolygon,
  moveRoomWallParallel,
  snapRoomVertexToOrthogonal,
} from './roomGeometry';

describe('연구실 외곽 편집', () => {
  it('정상적인 오목 다각형을 허용합니다.', () => {
    expect(isValidRoomPolygon([
      { x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 1000 },
      { x: 2000, y: 1000 }, { x: 2000, y: 3000 }, { x: 0, y: 3000 },
    ])).toBe(true);
  });

  it('서로 교차하는 외곽선은 거부합니다.', () => {
    expect(isValidRoomPolygon([
      { x: 0, y: 0 }, { x: 3000, y: 3000 }, { x: 0, y: 3000 }, { x: 3000, y: 0 },
    ])).toBe(false);
  });

  it('너무 짧은 벽 구간은 거부합니다.', () => {
    expect(isValidRoomPolygon([
      { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 3000, y: 3000 }, { x: 0, y: 3000 },
    ], 100)).toBe(false);
  });

  it('끝점이 인접 벽과 거의 수평이면 정확한 수평선에 맞춥니다.', () => {
    const vertices = [
      { x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, { x: 0, y: 3000 },
    ];
    const result = snapRoomVertexToOrthogonal(vertices, 1, { x: 3000, y: 120 });
    expect(result).toEqual({ point: { x: 3000, y: 0 }, snapped: true });
  });

  it('직각 스냅 범위를 벗어난 대각선은 그대로 유지합니다.', () => {
    const vertices = [
      { x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, { x: 0, y: 3000 },
    ];
    const result = snapRoomVertexToOrthogonal(vertices, 1, { x: 2700, y: 500 });
    expect(result).toEqual({ point: { x: 2700, y: 500 }, snapped: false });
  });

  it('각도가 작아도 직각선에서 멀리 떨어져 있으면 스냅하지 않습니다.', () => {
    const vertices = [
      { x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 12000, y: 3000 }, { x: 0, y: 3000 },
    ];
    const result = snapRoomVertexToOrthogonal(vertices, 1, { x: 10000, y: 300 }, 6, 100);
    expect(result).toEqual({ point: { x: 10000, y: 300 }, snapped: false });
  });

  it('대각선 벽을 평행 이동해도 양옆 벽의 기존 각도를 유지합니다.', () => {
    const moved = moveRoomWallParallel([
      { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 1000 }, { x: 2000, y: 2000 },
    ], 1, 100);
    expect(moved[1].y).toBeCloseTo(0);
    expect(moved[2].x).toBeCloseTo(2000);
    expect(moved[2].y - moved[1].y).toBeCloseTo(moved[2].x - moved[1].x);
  });

  it('안쪽 벽 길이는 안쪽 면 꼭짓점 사이의 실제 길이입니다.', () => {
    const vertices = [
      { x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 2500, y: 2000 }, { x: 0, y: 2000 },
    ];
    expect(getInteriorWallLength(vertices, 1)).toBe(Math.round(Math.hypot(500, 2000)));
  });

  it('외곽 벽은 안쪽 면에서 바깥쪽으로 전체 두께만큼 생성합니다.', () => {
    const vertices = [
      { x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 },
    ];
    const segments = getRoomWallOuterSegments(vertices, [], 100);
    expect(segments[0]).toEqual({
      inStart: { x: 0, y: 0 },
      inEnd: { x: 6000, y: 0 },
      outStart: { x: -100, y: -100 },
      outEnd: { x: 6100, y: -100 },
    });
  });

  it('외곽 벽 중심선은 안쪽 면에서 바깥쪽으로 반 두께 이동합니다.', () => {
    const vertices = [
      { x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 },
    ];
    expect(getRoomWallCenterline(vertices, 0, 100)).toEqual({
      start: { x: 0, y: -50 },
      end: { x: 6000, y: -50 },
    });
  });

  it('서로 다른 외곽 벽 두께도 같은 바깥 모서리 교차점에서 접합합니다.', () => {
    const vertices = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }];
    const segments = getRoomWallOuterSegments(vertices, [], [100, 200, 300, 400]);
    expect(segments[0]?.outEnd.x).toBeCloseTo(6200);
    expect(segments[0]?.outEnd.y).toBeCloseTo(-100);
    expect(segments[1]?.outStart.x).toBeCloseTo(6200);
    expect(segments[1]?.outStart.y).toBeCloseTo(-100);
    expect(segments[1]?.outEnd.x).toBeCloseTo(6200);
    expect(segments[1]?.outEnd.y).toBeCloseTo(4300);
    expect(segments[2]?.outStart.x).toBeCloseTo(6200);
    expect(segments[2]?.outStart.y).toBeCloseTo(4300);
  });

  it('인접 벽이 삭제되면 해당 끝을 교차점 대신 평마감합니다.', () => {
    const vertices = [
      { x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 },
    ];
    const segments = getRoomWallOuterSegments(vertices, [3], 100);
    expect(segments[0]?.outStart).toEqual({ x: 0, y: -100 });
    expect(segments[0]?.outEnd).toEqual({ x: 6100, y: -100 });
  });

  it('외곽 벽이 하나라도 비어 있으면 방 면을 닫힌 것으로 보지 않습니다.', () => {
    const vertices = [
      { x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 },
    ];
    expect(isRoomBoundaryClosed(vertices, [1])).toBe(false);
  });

  it('삭제된 구간을 새 벽이 빈틈없이 메우면 다시 닫힌 것으로 봅니다.', () => {
    const vertices = [
      { x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 },
    ];
    expect(isRoomBoundaryClosed(vertices, [1], [
      { start: { x: 5975, y: 0 }, end: { x: 5975, y: 2000 }, thickness: 50 },
      { start: { x: 5975, y: 2000 }, end: { x: 5975, y: 4000 }, thickness: 50 },
    ])).toBe(true);
  });

  it('대체 벽 사이에 작은 구간이라도 비면 닫힌 것으로 보지 않습니다.', () => {
    const vertices = [
      { x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 },
    ];
    expect(isRoomBoundaryClosed(vertices, [1], [
      { start: { x: 5975, y: 0 }, end: { x: 5975, y: 1900 }, thickness: 50 },
      { start: { x: 5975, y: 2000 }, end: { x: 5975, y: 4000 }, thickness: 50 },
    ])).toBe(false);
  });
});
