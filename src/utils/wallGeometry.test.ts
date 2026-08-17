import { describe, expect, it } from 'vitest';
import type { LayoutObject } from '../types/layout';
import { wallFromEndpoints } from './structurePlacement';
import { getClosedWallLoops, getObjectWallFaceGeometry, getWallJoinPolygons } from './wallGeometry';

const wall = (changes: Partial<LayoutObject>): LayoutObject => ({
  id: 'wall', type: 'wall', name: '벽', x: 0, y: -50,
  width: 1000, depth: 50, rotation: 0, locked: false, wallSide: -1,
  ...changes,
});

describe('안쪽 면 기준 벽 기하', () => {
  it('벽 두께가 안쪽 면 반대 방향으로만 생성됩니다.', () => {
    expect(getObjectWallFaceGeometry(wall({}))).toEqual({
      id: 'wall', source: 'object',
      start: { x: 0, y: 0 }, end: { x: 1000, y: 0 },
      outerStart: { x: 0, y: -50 }, outerEnd: { x: 1000, y: -50 },
      thickness: 50,
    });
  });

  it('직각으로 연결된 벽의 바깥쪽 모서리 틈을 채웁니다.', () => {
    const first = getObjectWallFaceGeometry(wall({ id: 'a' }));
    const second = getObjectWallFaceGeometry(wall({
      id: 'b', ...wallFromEndpoints({ x: 1000, y: 0 }, { x: 1000, y: 1000 }, 50, -1),
    }));
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const joins = getWallJoinPolygons([first!, second!]);
    expect(joins).toHaveLength(1);
    expect(joins[0]).toContainEqual({ x: 1050, y: -50 });
  });

  it('기준 면 끝점이 벽 두께만큼 어긋나도 같은 직각 모서리를 채웁니다.', () => {
    const horizontal = getObjectWallFaceGeometry(wall({
      id: 'horizontal',
      ...wallFromEndpoints({ x: 0, y: 0 }, { x: 1000, y: 0 }, 100, -1),
    }));
    const vertical = getObjectWallFaceGeometry(wall({
      id: 'vertical',
      ...wallFromEndpoints({ x: 1000, y: -100 }, { x: 1000, y: 1000 }, 100, -1),
    }));
    const [join] = getWallJoinPolygons([horizontal!, vertical!]);
    expect(join).toBeDefined();
    expect(join).toContainEqual({ x: 1000, y: 0 });
    expect(join).toContainEqual({ x: 1100, y: -100 });
    join.forEach((point) => {
      expect(point.x).toBeGreaterThanOrEqual(1000);
      expect(point.x).toBeLessThanOrEqual(1100);
      expect(point.y).toBeGreaterThanOrEqual(-100);
      expect(point.y).toBeLessThanOrEqual(0);
    });
  });

  it('직각 벽 끝점이 벽 두께 한 칸보다 멀면 채우지 않습니다.', () => {
    const horizontal = getObjectWallFaceGeometry(wall({
      id: 'horizontal',
      ...wallFromEndpoints({ x: 0, y: 0 }, { x: 1000, y: 0 }, 100, -1),
    }));
    const vertical = getObjectWallFaceGeometry(wall({
      id: 'vertical',
      ...wallFromEndpoints({ x: 1000, y: -300 }, { x: 1000, y: -200 }, 100, -1),
    }));
    expect(getWallJoinPolygons([horizontal!, vertical!])).toEqual([]);
  });

  it('연결되지 않은 벽 사이에는 모서리 채움이 생기지 않습니다.', () => {
    const first = getObjectWallFaceGeometry(wall({ id: 'a' }));
    const second = getObjectWallFaceGeometry(wall({ id: 'b', x: 1100, y: 0, rotation: 90 }));
    expect(getWallJoinPolygons([first!, second!])).toEqual([]);
  });

  it('추가 벽들이 닫힌 고리를 만들면 안쪽 면 다각형을 반환합니다.', () => {
    const points = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }];
    const walls = points.map((start, index) => wall({
      id: `wall-${index}`,
      ...wallFromEndpoints(start, points[(index + 1) % points.length], 50, -1),
    }));
    const [loop] = getClosedWallLoops(walls);
    expect(loop).toHaveLength(4);
    loop.forEach((point, index) => {
      expect(point.x).toBeCloseTo(points[index].x);
      expect(point.y).toBeCloseTo(points[index].y);
    });
  });

  it('추가 벽 고리에 틈이 있으면 다각형을 반환하지 않습니다.', () => {
    const walls = [
      wall({ id: 'a', ...wallFromEndpoints({ x: 0, y: 0 }, { x: 1000, y: 0 }, 50, -1) }),
      wall({ id: 'b', ...wallFromEndpoints({ x: 1000, y: 0 }, { x: 1000, y: 1000 }, 50, -1) }),
      wall({ id: 'c', ...wallFromEndpoints({ x: 1000, y: 1000 }, { x: 0, y: 1000 }, 50, -1) }),
    ];
    expect(getClosedWallLoops(walls)).toEqual([]);
  });
});
