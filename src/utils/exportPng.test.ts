import { describe, expect, it } from 'vitest';
import { createBlankProject } from '../store/layoutStore';
import { projectToSvg } from './exportPng';

describe('PNG용 평면 SVG', () => {
  it('캔버스와 동일하게 실내 면 다음에 외측 벽 폴리곤을 그립니다.', () => {
    const svg = projectToSvg(createBlankProject(6000, 4000), {
      showGrid: true,
      showLabels: true,
      showDimensions: true,
      includeBackground: true,
    });
    const wallIndex = svg.indexOf('data-room-wall="0"');
    const interiorIndex = svg.indexOf('fill="#ffffff" stroke="none"');
    expect(wallIndex).toBeGreaterThan(-1);
    expect(interiorIndex).toBeLessThan(wallIndex);
    expect(svg).not.toContain('stroke-linecap="square"');
  });

  it('추가한 벽도 기존 벽과 같은 색과 선 스타일로 내보냅니다.', () => {
    const project = createBlankProject(6000, 4000);
    project.objects.push({
      id: 'wall-1', type: 'wall', name: '벽 1', x: 1000, y: 1000,
      width: 2000, depth: 50, rotation: 0, locked: false,
    });
    const svg = projectToSvg(project, {
      showGrid: false,
      showLabels: false,
      showDimensions: false,
      includeBackground: true,
    });
    expect(svg).not.toContain('#4e5968');
    expect(svg.match(/fill="#343740"/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('벽 경계에 빈 구간이 있으면 흰색 방 면을 내보내지 않습니다.', () => {
    const project = createBlankProject(6000, 4000);
    project.room.removedWallIndices = [0];
    const svg = projectToSvg(project, {
      showGrid: false,
      showLabels: false,
      showDimensions: false,
      includeBackground: true,
    });
    expect(svg).not.toContain('points="0,0 6000,0 6000,4000 0,4000" fill="#ffffff"');
  });
});
