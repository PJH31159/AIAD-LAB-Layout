import { describe, expect, it } from 'vitest';
import { createBlankProject } from '../store/layoutStore';
import type { LayoutObject } from '../types/layout';
import { analyzeProject, occupiedAreaInsideRoom } from './analysis';

const desk = (id: string, x: number, y: number, rotation = 0): LayoutObject => ({ id, type: 'desk', name: id, x, y, width: 1000, depth: 1000, rotation, locked: false });

describe('정확 기하 분석', () => {
  it('겹친 가구는 합집합 면적으로 한 번만 계산합니다.', () => {
    const room = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }];
    expect(occupiedAreaInsideRoom(room, [desk('a', 0, 0), desk('b', 500, 0)])).toBeCloseTo(1_500_000, 2);
  });

  it('외곽 밖으로 나간 부분은 점유 면적에서 제외합니다.', () => {
    const room = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }];
    expect(occupiedAreaInsideRoom(room, [desk('a', 500, 0)])).toBeCloseTo(500_000, 2);
  });

  it('분석에 잔여 면적과 객체 경계 기반 최소 통로를 반영합니다.', () => {
    const project = createBlankProject(4000, 3000);
    project.objects = [desk('a', 500, 500), desk('b', 2000, 500)];
    const analysis = analyzeProject(project);
    expect(analysis.occupiedAreaM2).toBeCloseTo(2);
    expect(analysis.remainingAreaM2).toBeCloseTo(10);
    expect(analysis.minimumAisleMm).toBeCloseTo(500);
    expect(analysis.desks).toBe(2);
  });

  it('회의 공간에 테이블이 있어도 회의 공간 수를 중복 계산하지 않습니다.', () => {
    const project = createBlankProject(4000, 3000);
    project.room.spaces = [{ id: 'meeting', name: '회의 공간', type: 'meeting', bounds: { x: 0, y: 0, width: 2000, depth: 2000 } }];
    project.objects = [{ id: 'table', type: 'meeting-table', name: '회의 테이블', x: 500, y: 500, width: 1000, depth: 600, rotation: 0, locked: false, spaceId: 'meeting' }];
    expect(analyzeProject(project).meetingSpaces).toBe(1);
  });
});
