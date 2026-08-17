import { describe, expect, it } from 'vitest';
import {
  getFurnitureWallSnapCandidate,
  getObjectWallSnapSurface,
  getWallEndpoints,
  inferWallSideFromRoom,
  resolveFurnitureDragPosition,
  snapObjectToWallSurfaces,
  snapObjectToRoomBoundary,
  snapWallSurfaceToGrid,
  wallFromEndpoints,
} from './structurePlacement';

const room = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
];

describe('벽 부착 구조 요소', () => {
  it('가장 가까운 가로 벽의 중심선과 방향에 맞춥니다.', () => {
    const result = snapObjectToRoomBoundary(
      { x: 2550, y: 300, width: 900, depth: 120, rotation: 45 },
      room,
    );
    expect(result).toEqual({ x: 2550, y: -120, rotation: 0 });
  });

  it('가장 가까운 세로 벽에 맞춰 90도로 회전합니다.', () => {
    const result = snapObjectToRoomBoundary(
      { x: 5600, y: 1500, width: 900, depth: 120, rotation: 0 },
      room,
    );
    expect(result.x).toBe(5610);
    expect(result.rotation).toBe(90);
  });

  it('문 전체가 짧은 벽 구간의 모서리를 넘어가지 않게 제한합니다.', () => {
    const result = snapObjectToRoomBoundary(
      { x: 2600, y: 940, width: 900, depth: 120, rotation: 0 },
      [{ x: 1800, y: 1000 }, { x: 3100, y: 1000 }, { x: 3100, y: 5000 }, { x: 1800, y: 5000 }],
    );
    expect(result).toEqual({ x: 2200, y: 880, rotation: 0 });
  });
});

describe('가구 벽 맞춤', () => {
  it('벽에서 50 mm 이내인 가구를 회전하지 않고 붙입니다.', () => {
    const candidate = getFurnitureWallSnapCandidate(
      { x: 1200, y: 40, width: 1400, depth: 700, rotation: 0 },
      room,
      50,
    );
    expect(candidate?.x).toBe(1200);
    expect(candidate?.y).toBe(0);
    expect(candidate?.distance).toBe(40);
  });

  it('벽에서 50 mm보다 멀면 자동 맞춤 후보를 만들지 않습니다.', () => {
    expect(getFurnitureWallSnapCandidate(
      { x: 1200, y: 51, width: 1400, depth: 700, rotation: 0 },
      room,
      50,
    )).toBeNull();
  });

  it('명시적 맞춤에서는 가장 가까운 벽까지 이동합니다.', () => {
    const candidate = getFurnitureWallSnapCandidate(
      { x: 2200, y: 1200, width: 900, depth: 450, rotation: 0 },
      room,
      Number.POSITIVE_INFINITY,
    );
    expect(candidate?.y).toBe(0);
  });

  it('멀리 있는 기둥 정렬보다 원래 드래그 좌표의 벽 스냅을 우선합니다.', () => {
    const desk = {
      id: 'desk', type: 'desk' as const, name: '연구원 책상',
      x: 200, y: 1000, width: 1400, depth: 700, rotation: 0, locked: false,
    };
    const column = {
      id: 'column', type: 'column' as const, name: '기둥',
      x: 1490, y: 3000, width: 500, depth: 500, rotation: 0, locked: true,
    };
    const result = resolveFurnitureDragPosition(desk, 40, 1000, [column], {
      roomVertices: room,
      gridSize: 100,
      snapEnabled: true,
      wallSnapEnabled: true,
      alignmentThreshold: 50,
    });
    expect(result.x).toBe(0);
    expect(result.y).toBe(1000);
    expect(result.wallCandidate).not.toBeNull();
    expect(result.guides).toEqual({});
  });

  it('한쪽 벽에 이미 붙은 가구도 모서리의 다른 벽에 동시에 맞춥니다.', () => {
    const desk = {
      id: 'desk', type: 'desk' as const, name: '연구원 책상',
      x: 200, y: 0, width: 1400, depth: 700, rotation: 0, locked: false,
    };
    const result = resolveFurnitureDragPosition(desk, 40, 0, [], {
      roomVertices: room,
      gridSize: 100,
      snapEnabled: true,
      wallSnapEnabled: true,
      alignmentThreshold: 50,
    });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.wallCandidate).not.toBeNull();
  });

  it('모서리에서 벽 바깥으로 50 mm 이내 벗어나도 안쪽 모서리로 복귀시킵니다.', () => {
    const desk = {
      id: 'desk', type: 'desk' as const, name: '연구원 책상',
      x: 200, y: 0, width: 1400, depth: 700, rotation: 0, locked: false,
    };
    const result = resolveFurnitureDragPosition(desk, -40, 0, [], {
      roomVertices: room,
      gridSize: 100,
      snapEnabled: true,
      wallSnapEnabled: true,
      alignmentThreshold: 50,
    });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('벽 스냅 위치를 기둥이 실제로 차지하면 강제로 겹치지 않습니다.', () => {
    const desk = {
      id: 'desk', type: 'desk' as const, name: '연구원 책상',
      x: 200, y: 1000, width: 1400, depth: 700, rotation: 0, locked: false,
    };
    const column = {
      id: 'column', type: 'column' as const, name: '기둥',
      x: 0, y: 1100, width: 500, depth: 500, rotation: 0, locked: true,
    };
    const result = resolveFurnitureDragPosition(desk, 40, 1000, [column], {
      roomVertices: room,
      gridSize: 100,
      snapEnabled: true,
      wallSnapEnabled: true,
      alignmentThreshold: 50,
    });
    expect(result.wallCandidate).toBeNull();
  });

  it('추가한 벽의 안쪽 면에도 가구가 정확히 붙습니다.', () => {
    const surface = getObjectWallSnapSurface({
      id: 'wall', type: 'wall', name: '벽', x: 0, y: -50,
      width: 3000, depth: 50, rotation: 0, locked: false, wallSide: -1,
    });
    const desk = { x: 500, y: 40, width: 1000, depth: 500, rotation: 0 };
    const candidate = getFurnitureWallSnapCandidate(desk, [], 50, [], surface ? [surface] : []);
    expect(candidate).toMatchObject({ x: 500, y: 0 });
  });

  it('문도 추가한 벽의 두께 안으로 부착됩니다.', () => {
    const surface = getObjectWallSnapSurface({
      id: 'wall', type: 'wall', name: '벽', x: 0, y: -50,
      width: 3000, depth: 50, rotation: 0, locked: false, wallSide: -1,
    });
    const door = { x: 500, y: 200, width: 900, depth: 50, rotation: 0 };
    expect(snapObjectToWallSurfaces(door, surface ? [surface] : [])).toEqual({
      x: 500, y: -50, rotation: 0,
    });
  });
});

describe('안쪽 면 기준 벽 기하', () => {
  const wall = { x: 100, y: 200, width: 2400, depth: 100, rotation: 0 };

  it('렌더링된 벽의 안쪽 면 양 끝점을 계산합니다.', () => {
    expect(getWallEndpoints(wall)).toEqual({
      start: { x: 100, y: 200 },
      end: { x: 2500, y: 200 },
    });
    expect(getWallEndpoints({ ...wall, rotation: 90 })).toEqual({
      start: { x: 1350, y: -950 },
      end: { x: 1350, y: 1450 },
    });
  });

  it('안쪽 면 두 끝점에서 벽 객체 표현을 정확히 복원합니다.', () => {
    expect(wallFromEndpoints({ x: 100, y: 200 }, { x: 2500, y: 200 }, 100)).toEqual({
      x: 100,
      y: 200,
      width: 2400,
      depth: 100,
      rotation: 0,
      wallSide: 1,
    });
  });

  it('직교 벽의 안쪽 면 시작점을 10 mm 단위에 맞춥니다.', () => {
    const snapped = snapWallSurfaceToGrid({ ...wall, x: 0, y: 0, rotation: 90 }, 100, true);
    const face = getWallEndpoints(snapped);
    expect(face.start.x % 10).toBeCloseTo(0);
    expect(face.start.y % 10).toBeCloseTo(0);
  });

  it('8,000 mm 벽은 100 mm 격자에서 정확히 80칸을 채웁니다.', () => {
    const wallGeometry = wallFromEndpoints({ x: 0, y: 0 }, { x: 8000, y: 0 }, 100, -1);
    const snapped = snapWallSurfaceToGrid(wallGeometry, 100, true);
    const face = getWallEndpoints(snapped);
    expect(face.start.x % 100).toBeCloseTo(0);
    expect(face.start.y % 100).toBeCloseTo(0);
    expect(face.end.x % 100).toBeCloseTo(0);
    expect(Math.hypot(face.end.x - face.start.x, face.end.y - face.start.y)).toBe(8000);
    expect((face.end.x - face.start.x) / 100).toBe(80);
    expect(snapped.depth).toBe(100);
  });

  it('3,240 mm 실측 벽 길이를 10 mm 단위로 유지합니다.', () => {
    const snapped = snapWallSurfaceToGrid({
      x: 43, y: 27, width: 3240, depth: 100, rotation: 0, wallSide: -1,
    }, 100, true);
    const face = getWallEndpoints(snapped);
    expect(snapped.width).toBe(3240);
    expect(face.start.x % 10).toBeCloseTo(0);
    expect(face.start.y % 10).toBeCloseTo(0);
    expect(Math.hypot(face.end.x - face.start.x, face.end.y - face.start.y)).toBe(3240);
  });

  it('구형 벽 사각형에서 방 경계와 맞닿은 면을 안쪽 면으로 추론합니다.', () => {
    expect(inferWallSideFromRoom(
      { x: 0, y: -50, width: 6000, depth: 50, rotation: 0 },
      room,
    )).toBe(-1);
  });

});
