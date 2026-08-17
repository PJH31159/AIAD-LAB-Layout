import { describe, expect, it } from 'vitest';
import type { LayoutObject } from '../types/layout';
import { sliceWallPolygon, splitWallSections, wallOpeningForObject } from './threeGeometry';

const object = (changes: Partial<LayoutObject>): LayoutObject => ({
  id: 'opening', type: 'door', name: '문', x: 2000, y: 0, width: 900, depth: 100,
  rotation: 0, locked: false, ...changes,
});

describe('3D 벽 개구부 형상', () => {
  it('문은 바닥부터 문 높이까지 비우고 상부 벽을 남깁니다.', () => {
    const opening = wallOpeningForObject(object({}), { x: 0, y: 0 }, { x: 6000, y: 0 }, 2700);
    expect(opening).toEqual({ start: 2000, end: 2900, bottom: 0, top: 2100 });
    expect(splitWallSections(6000, 2700, opening ? [opening] : [])).toEqual([
      { start: 0, end: 2000, bottom: 0, top: 2700 },
      { start: 2000, end: 2900, bottom: 2100, top: 2700 },
      { start: 2900, end: 6000, bottom: 0, top: 2700 },
    ]);
  });

  it('창문은 하부 벽과 상부 벽을 모두 남깁니다.', () => {
    const opening = wallOpeningForObject(object({ type: 'window', x: 1000, width: 1200, height: 1000 }), { x: 0, y: 0 }, { x: 5000, y: 0 }, 2700);
    expect(opening).toEqual({ start: 1000, end: 2200, bottom: 900, top: 1900 });
    const sections = splitWallSections(5000, 2700, opening ? [opening] : []);
    expect(sections).toContainEqual({ start: 1000, end: 2200, bottom: 0, top: 900 });
    expect(sections).toContainEqual({ start: 1000, end: 2200, bottom: 1900, top: 2700 });
  });

  it('회전된 개구부도 벽의 길이 축에 투영합니다.', () => {
    const opening = wallOpeningForObject(object({ x: -50, y: 2000, width: 800, rotation: 90 }), { x: 0, y: 0 }, { x: 0, y: 6000 }, 2700);
    expect(opening).toMatchObject({ start: 1650, end: 2450 });
  });

  it('벽 조각은 안쪽 면과 두께 인식 바깥쪽 면을 같은 비율로 자릅니다.', () => {
    expect(sliceWallPolygon({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: -100, y: -100 }, { x: 1100, y: -100 }, .2, .6)).toEqual([
      { x: 200, y: 0 }, { x: 600, y: 0 }, { x: 620, y: -100 }, { x: 140, y: -100 },
    ]);
  });
});
