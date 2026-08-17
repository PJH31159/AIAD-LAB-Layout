import { describe, expect, it } from 'vitest';
import type { LayoutObject } from '../types/layout';
import { alignObjectPosition } from './alignment';

const object = (changes: Partial<LayoutObject>): LayoutObject => ({
  id: 'object',
  type: 'desk',
  name: '객체',
  x: 0,
  y: 0,
  width: 100,
  depth: 100,
  rotation: 0,
  locked: false,
  ...changes,
});

describe('객체 정렬', () => {
  it('수직으로 멀리 떨어진 기둥은 X축 정렬 대상으로 사용하지 않습니다.', () => {
    const result = alignObjectPosition(
      object({ id: 'desk' }),
      40,
      0,
      [object({ id: 'column', type: 'column', x: 150, y: 2000, width: 50, depth: 50 })],
      20,
      500,
    );
    expect(result).toEqual({ x: 40, y: 0, guides: {} });
  });

  it('가까운 기둥은 기존처럼 정렬 대상으로 사용합니다.', () => {
    const result = alignObjectPosition(
      object({ id: 'desk' }),
      40,
      0,
      [object({ id: 'column', type: 'column', x: 150, y: 150, width: 50, depth: 50 })],
      20,
      500,
    );
    expect(result.x).toBe(50);
    expect(result.guides.x).toBe(150);
  });

  it('객체 배열 순서가 아니라 이동량이 가장 작은 후보를 선택합니다.', () => {
    const result = alignObjectPosition(
      object({ id: 'desk' }),
      100,
      0,
      [
        object({ id: 'far', x: 112, y: 0, width: 50, depth: 50 }),
        object({ id: 'near', x: 105, y: 0, width: 50, depth: 50 }),
      ],
      20,
      500,
    );
    expect(result.x).toBe(105);
    expect(result.guides.x).toBe(105);
  });

  it('별도 제한이 없으면 멀리 있는 일반 가구 정렬은 유지합니다.', () => {
    const result = alignObjectPosition(
      object({ id: 'desk' }),
      40,
      0,
      [object({ id: 'other-desk', type: 'desk', x: 150, y: 2000, width: 50, depth: 50 })],
      20,
    );
    expect(result.x).toBe(50);
    expect(result.guides.x).toBe(150);
  });
});
