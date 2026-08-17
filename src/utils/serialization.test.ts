import { beforeEach, describe, expect, it } from 'vitest';
import { deleteProjectSnapshot, loadProjectLibrary, parseProject, saveProjectSnapshot, serializeProject } from './serialization';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
});

const snapshotProject = () => parseProject(JSON.stringify({
  version: 3,
  projectName: '보관 테스트',
  room: { name: '연구실', vertices: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 4000 }, { x: 0, y: 4000 }] },
  objects: [{ id: 'desk-1', type: 'desk', name: '책상', x: 100, y: 100, width: 1400, depth: 700, rotation: 0, locked: false }],
  settings: { unit: 'mm', gridSize: 100, snapEnabled: true, minimumAisleWidth: 900, showGrid: true, showLabels: true, showDimensions: true, exportBackground: true },
  updatedAt: '2026-08-06T00:00:00.000Z',
}));

describe('프로젝트 직렬화', () => {
  it('v3 데이터를 손실 없이 다시 읽습니다.', () => {
    const project = parseProject(JSON.stringify({
      version: 3,
      projectName: '테스트',
      room: { name: '연구실', vertices: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }] },
      objects: [{ id: 'desk-1', type: 'desk', name: '책상', x: 100, y: 100, width: 400, depth: 200, rotation: 0, locked: false }],
      settings: { unit: 'mm', gridSize: 50, snapEnabled: true, minimumAisleWidth: 900, showGrid: true, showLabels: true, showDimensions: true, exportBackground: true },
      updatedAt: '2026-08-06T00:00:00.000Z',
    }));
    expect(parseProject(serializeProject(project))).toEqual(project);
  });

  it('v4 저장 데이터를 다시 읽을 때 현재 좌표와 부착 위치를 변경하지 않습니다.', () => {
    const project = snapshotProject();
    project.room.vertices[0] = { x: 7, y: 13 };
    project.objects = [
      { id: 'wall', type: 'wall', name: '벽', x: 123, y: 457, width: 987, depth: 70, rotation: 17, locked: false, wallSide: -1, spaceId: undefined },
      { id: 'door', type: 'door', name: '문', x: 731, y: 829, width: 900, depth: 70, rotation: 17, locked: false, wallAttachmentId: 'wall', doorHinge: 'left', doorSwing: 'inward', doorOpeningAngle: 90, spaceId: undefined },
    ];
    expect(parseProject(serializeProject(project))).toEqual(project);
  });

  it('v2 cm 좌표를 v4 mm로 변환합니다.', () => {
    const project = parseProject(JSON.stringify({
      version: '2.0.0',
      projectName: '구형 배치',
      roomBoundary: { vertices: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }] },
      furniture: [{ id: 'legacy-desk', type: 'gradDesk', name: '책상', x: 120, y: 80, w: 140, h: 70 }],
      structures: [],
      doors: [],
      windows: [],
      glassWalls: [],
      settings: { gridSize: 10, snap: true, minAisleWidth: 90 },
    }));
    expect(project.version).toBe(4);
    expect(project.room.vertices[1].x).toBe(5000);
    expect(project.objects[0].x).toBe(1200);
    expect(project.objects[0].width).toBe(1400);
    expect(project.settings.minimumAisleWidth).toBe(900);
  });

  it('v2 선분형 유리벽은 두께와 무관하게 원래 중심선을 유지합니다.', () => {
    const project = parseProject(JSON.stringify({
      version: '2.0.0',
      roomBoundary: { vertices: [{ x: -100, y: -100 }, { x: 200, y: -100 }, { x: 200, y: 200 }, { x: -100, y: 200 }] },
      furniture: [], structures: [], doors: [], windows: [],
      glassWalls: [{ id: 'glass', start: { x: 0, y: 0 }, end: { x: 0, y: 100 }, thickness: 20 }],
      settings: {},
    }));
    const glass = project.objects[0];
    expect(glass.depth).toBe(200);
    expect({ x: glass.x + glass.width / 2, y: glass.y + glass.depth / 2 }).toEqual({ x: 0, y: 500 });
  });

  it('손상된 JSON은 오류를 반환합니다.', () => {
    expect(() => parseProject('{broken')).toThrow('JSON 문법');
  });

  it('현재 v4 객체가 손상되거나 ID가 중복되면 일부를 버리지 않고 가져오기를 중단합니다.', () => {
    const project = snapshotProject();
    expect(() => parseProject(JSON.stringify({ ...project, objects: undefined }))).toThrow('객체 목록');
    expect(() => parseProject(JSON.stringify({ ...project, objects: [{ ...project.objects[0], type: 'unknown' }] }))).toThrow('지원하지 않는 객체');
    expect(() => parseProject(JSON.stringify({ ...project, objects: [project.objects[0], { ...project.objects[0] }] }))).toThrow('중복된 객체 ID');
  });

  it('project-main v3.1 cm 데이터를 v4 mm 모델로 변환합니다.', () => {
    const project = parseProject(JSON.stringify({
      version: '3.1.0',
      projectName: '공용 배치안',
      officialRevision: 6,
      roomBoundary: { vertices: [{ x: 0, y: 0 }, { x: 624, y: 0 }, { x: 624, y: 800 }, { x: 0, y: 800 }] },
      spaces: [{ id: 'main', name: '주 공간', type: 'common', bounds: { x: 0, y: 0, w: 624, h: 800 } }],
      walls: [],
      glassWalls: [{ id: 'glass', type: 'glass-wall', start: { x: 624, y: 294 }, end: { x: 624, y: 800 }, thickness: 10 }],
      doors: [{ id: 'door', x: 420, y: 800, width: 90, rotation: 0, openingDirection: 'inward-up-right' }],
      windows: [],
      structures: [{ id: 'column', type: 'column', x: 326.5, y: 182, w: 65, h: 66 }],
      furniture: [{ id: 'desk', type: 'existingDesk', x: 200, y: 200, w: 180, h: 100, seats: 1 }],
      settings: { minAisleWidth: 90, wallHeight: 270 },
    }));
    expect(project.version).toBe(4);
    expect(project.room.vertices[2]).toEqual({ x: 6240, y: 8000 });
    expect(project.room.wallHeight).toBe(2700);
    expect(project.objects.find((object) => object.id === 'glass')).toMatchObject({ type: 'glass-wall', width: 5060 });
    expect(project.objects.find((object) => object.id === 'desk')).toMatchObject({ type: 'existing-desk', width: 1800, depth: 1000 });
  });

  it('기존 문에는 기본 개폐 방향을 적용하고 벽 구간 안으로 보정합니다.', () => {
    const project = parseProject(JSON.stringify({
      version: 3,
      projectName: '문 테스트',
      room: { name: '연구실', vertices: [{ x: 1800, y: 1000 }, { x: 3100, y: 1000 }, { x: 3100, y: 5000 }, { x: 1800, y: 5000 }] },
      objects: [{ id: 'door-1', type: 'door', name: '문', x: 2600, y: 940, width: 900, depth: 120, rotation: 0, locked: false }],
      settings: { unit: 'mm', gridSize: 100, snapEnabled: true, minimumAisleWidth: 900, showGrid: true, showLabels: true, showDimensions: true, exportBackground: true },
      updatedAt: '2026-08-06T00:00:00.000Z',
    }));
    expect(project.objects[0]).toMatchObject({ x: 2200, y: 900, depth: 100, doorHinge: 'left', doorSwing: 'inward', wallAttachmentId: 'room-wall-0' });
  });

  it('구형 벽의 화면 위치를 유지하며 방 경계와 맞닿은 면을 안쪽 면으로 변환합니다.', () => {
    const project = parseProject(JSON.stringify({
      version: 3,
      projectName: '벽 변환 테스트',
      room: { name: '연구실', vertices: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }] },
      objects: [{ id: 'wall-1', type: 'wall', name: '벽', x: 0, y: -50, width: 6000, depth: 50, rotation: 0, locked: false }],
      settings: { unit: 'mm', gridSize: 100, snapEnabled: true, minimumAisleWidth: 900, showGrid: true, showLabels: true, showDimensions: true, exportBackground: true },
      updatedAt: '2026-08-06T00:00:00.000Z',
    }));
    expect(project.objects[0]).toMatchObject({ x: 0, y: -50, depth: 50, wallSide: -1 });

  });

  it('project-main 회의 의자, 방향, 격자, 공간과 벽 두께를 보존합니다.', () => {
    const project = parseProject(JSON.stringify({
      version: '3.1.0',
      roomBoundary: { vertices: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 0, y: 400 }] },
      spaces: [{ id: 'meeting-room', name: '회의실', type: 'meeting', bounds: { x: 0, y: 0, w: 250, h: 400 } }],
      walls: [{ id: 'wall', type: 'wall', start: { x: 250, y: 0 }, end: { x: 250, y: 400 }, thickness: 18 }],
      glassWalls: [{ id: 'glass', type: 'glass-wall', start: { x: 300, y: 0 }, end: { x: 300, y: 400 }, thickness: 12 }],
      doors: [{ id: 'door', x: 0, y: 0, width: 90, thickness: 15 }],
      windows: [{ id: 'window', start: { x: 500, y: 100 }, end: { x: 500, y: 200 }, thickness: 14 }],
      furniture: [{ id: 'meeting-chair', type: 'meetingChair', x: 100, y: 100, w: 60, h: 60, space: '회의실' }],
      settings: { gridSize: 25 },
      orientation: { rotationDegrees: 90, label: '동쪽 기준' },
    }));
    expect(project.settings.gridSize).toBe(250);
    expect(project.orientation).toEqual({ rotationDegrees: 90, label: '동쪽 기준' });
    expect(project.objects.find((object) => object.id === 'meeting-chair')).toMatchObject({ type: 'meeting-chair', spaceId: 'meeting-room' });
    expect(project.objects.find((object) => object.id === 'wall')?.depth).toBe(180);
    expect(project.objects.find((object) => object.id === 'glass')?.depth).toBe(120);
    expect(project.objects.find((object) => object.id === 'door')?.depth).toBe(150);
    expect(project.objects.find((object) => object.id === 'window')?.depth).toBe(140);
  });

  it('동일한 배치안을 반복 보관해도 항목 수가 늘어나지 않습니다.', () => {
    const project = snapshotProject();
    const first = saveProjectSnapshot(project);
    const second = saveProjectSnapshot({ ...project, updatedAt: '2026-08-06T01:00:00.000Z' });
    expect(second.id).toBe(first.id);
    expect(loadProjectLibrary()).toHaveLength(1);
  });

  it('실제 배치가 달라지면 별도 보관 항목으로 추가합니다.', () => {
    const project = snapshotProject();
    saveProjectSnapshot(project);
    saveProjectSnapshot({
      ...project,
      objects: project.objects.map((object) => ({ ...object, x: object.x + 100 })),
    });
    expect(loadProjectLibrary()).toHaveLength(2);
  });

  it('보관된 배치안을 식별자로 삭제합니다.', () => {
    const entry = saveProjectSnapshot(snapshotProject());
    expect(deleteProjectSnapshot(entry.id)).toHaveLength(0);
    expect(loadProjectLibrary()).toHaveLength(0);
  });
});
