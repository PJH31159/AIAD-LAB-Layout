import { describe, expect, it } from 'vitest';
import type { LayoutObject } from '../types/layout';
import { createBlankProject } from '../store/layoutStore';
import { getLayoutWarnings, getProjectLayoutWarnings, objectsOverlap, pointInPolygon } from './collision';

const room = [
  { x: 0, y: 0 },
  { x: 5000, y: 0 },
  { x: 5000, y: 5000 },
  { x: 0, y: 5000 },
];

const object = (changes: Partial<LayoutObject>): LayoutObject => ({
  id: 'desk-1',
  type: 'desk',
  name: '책상 1',
  x: 1000,
  y: 1000,
  width: 1400,
  depth: 700,
  rotation: 0,
  locked: false,
  ...changes,
});

describe('충돌 검사', () => {
  it('열린 외곽은 닫힌 방으로 간주하지 않는 공통 프로젝트 경고 계약을 사용합니다.', () => {
    const project = createBlankProject(1000, 1000);
    project.room.removedWallIndices = [0];
    project.objects = [object({ x: 2000, y: 2000, width: 400, depth: 200 })];
    expect(getProjectLayoutWarnings(project).some((warning) => warning.kind === 'outside')).toBe(false);
  });
  it('다각형 안과 밖의 점을 구분합니다.', () => {
    expect(pointInPolygon({ x: 100, y: 100 }, room)).toBe(true);
    expect(pointInPolygon({ x: 5000, y: 100 }, room)).toBe(true);
    expect(pointInPolygon({ x: 5100, y: 100 }, room)).toBe(false);
  });

  it('벽에 정확히 붙은 가구를 외곽 이탈로 판단하지 않습니다.', () => {
    const warnings = getLayoutWarnings(
      [object({ x: 3600, y: 1000 })],
      room,
    );
    expect(warnings.some((warning) => warning.kind === 'outside')).toBe(false);
  });

  it('겹치는 객체만 감지합니다.', () => {
    expect(objectsOverlap(object({}), object({ id: 'desk-2', x: 2000 }))).toBe(true);
    expect(objectsOverlap(object({}), object({ id: 'desk-3', x: 3000 }))).toBe(false);
  });

  it('가구 겹침, 기둥 충돌, 외곽 이탈 경고를 만듭니다.', () => {
    const warnings = getLayoutWarnings(
      [
        object({}),
        object({ id: 'chair-1', type: 'chair', name: '의자', x: 1100, y: 1200 }),
        object({ id: 'column-1', type: 'column', name: '기둥', x: 1300, y: 1200, width: 500, depth: 500 }),
        object({ id: 'desk-outside', name: '외부 책상', x: 4800, y: 4600 }),
      ],
      room,
    );
    expect(warnings.some((warning) => warning.kind === 'overlap')).toBe(true);
    expect(warnings.some((warning) => warning.kind === 'column-overlap')).toBe(true);
    expect(warnings.some((warning) => warning.kind === 'outside')).toBe(true);
  });

  it('닫힌 벽 경계가 없으면 근거 없는 외부 경고를 만들지 않습니다.', () => {
    const warnings = getLayoutWarnings(
      [object({ id: 'desk-outside', name: '외부 책상', x: 8000, y: 8000 })],
      room,
      0,
      [],
      false,
    );
    expect(warnings.some((warning) => warning.kind === 'outside')).toBe(false);
  });

  it('설정한 최소 통로 폭보다 가까운 가구를 감지합니다.', () => {
    const warnings = getLayoutWarnings(
      [object({ width: 500, depth: 500 }), object({ id: 'desk-2', x: 1700, width: 500, depth: 500 })],
      room,
      300,
    );
    expect(warnings.some((warning) => warning.kind === 'aisle')).toBe(true);
  });

  it('문이 열리는 부채꼴 안에 놓인 가구를 감지합니다.', () => {
    const door = object({
      id: 'door-1',
      type: 'door',
      name: '출입문',
      x: 1000,
      y: -60,
      width: 900,
      depth: 120,
      doorHinge: 'left',
      doorSwing: 'inward',
    });
    const warnings = getLayoutWarnings([
      door,
      object({ id: 'desk-in-swing', x: 1200, y: 200, width: 300, depth: 300 }),
      object({ id: 'desk-clear', x: 2500, y: 200, width: 300, depth: 300 }),
    ], room);
    expect(warnings.filter((warning) => warning.kind === 'door-swing')).toHaveLength(1);
    expect(warnings.find((warning) => warning.kind === 'door-swing')?.objectIds).toContain('desk-in-swing');
  });

  it('오목한 외곽의 뚫린 구간을 가로지르는 가구를 외부 이탈로 감지합니다.', () => {
    const concaveRoom = [
      { x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 },
      { x: 3000, y: 1000 }, { x: 3000, y: 0 }, { x: 5000, y: 0 },
      { x: 5000, y: 5000 }, { x: 0, y: 5000 },
    ];
    const warnings = getLayoutWarnings([
      object({ x: 1500, y: 500, width: 2000, depth: 300 }),
    ], concaveRoom);
    expect(warnings.some((warning) => warning.kind === 'outside')).toBe(true);
  });
});
