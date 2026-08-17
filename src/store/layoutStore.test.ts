import { beforeEach, describe, expect, it } from 'vitest';
import { createBlankProject, createInitialProject, useLayoutStore } from './layoutStore';
import { wallFromEndpoints } from '../utils/structurePlacement';
import { rotatedBounds } from '../utils/coordinates';

describe('배치 편집 스토어', () => {
  it('초기 배치안은 공식 연구실 도면과 고정 시설을 불러옵니다.', () => {
    const project = createInitialProject();
    expect(project.version).toBe(4);
    expect(project.room.officialId).toBe('aiad-official-2026-08');
    expect(project.room.officialRevision).toBe(7);
    expect(project.room.vertices).toHaveLength(17);
    expect(project.objects).toHaveLength(16);
    expect(project.objects.some((object) => object.id === 'glass-main')).toBe(true);
    expect(project.objects.filter((object) => object.type === 'outlet')).toHaveLength(6);
    expect(project.room.removedWallIndices).toEqual([]);
    expect(project.objects.some((object) => object.id.startsWith('wall-block-'))).toBe(false);
    expect(project.objects.find((object) => object.id === 'door-south-left')).toMatchObject({ x: 4200, y: 8000, depth: 100, rotation: 180, wallAttachmentId: 'room-wall-11', doorHinge: 'right', doorSwing: 'inward', doorOpeningAngle: 90 });
  });

  beforeEach(() => {
    useLayoutStore.setState({
      project: createBlankProject(6000, 4000),
      selectedId: null,
      selectedIds: [],
      selectedRoomWallIndex: null,
      selectedSpaceId: null,
      past: [],
      future: [],
      historyFutureCheckpoint: null,
      clipboard: null,
      toast: null,
    });
  });

  it('같은 가구를 반복 추가해도 동일한 좌표에 겹치지 않습니다.', () => {
    const firstId = useLayoutStore.getState().addObject('desk');
    const secondId = useLayoutStore.getState().addObject('desk');
    const objects = useLayoutStore.getState().project.objects;
    const first = objects.find((object) => object.id === firstId);
    const second = objects.find((object) => object.id === secondId);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect({ x: second?.x, y: second?.y }).not.toEqual({ x: first?.x, y: first?.y });
  });

  it('벽 부착 객체는 안쪽 면을 침범하지 않고 벽체 안에 추가합니다.', () => {
    const id = useLayoutStore.getState().addObject('door');
    const door = useLayoutStore.getState().project.objects.find((object) => object.id === id);
    expect(door?.y).toBe(-100);
    expect(door?.rotation).toBe(0);
  });

  it('선택한 객체를 내부 클립보드로 복사하고 붙여넣습니다.', () => {
    const id = useLayoutStore.getState().addObject('chair');
    useLayoutStore.getState().selectObject(id);
    useLayoutStore.getState().copySelected();
    useLayoutStore.getState().pasteObject();
    const state = useLayoutStore.getState();
    expect(state.project.objects).toHaveLength(2);
    expect(state.project.objects[1].name).toContain('복사본');
    expect(state.selectedId).toBe(state.project.objects[1].id);
  });

  it('그룹 객체 하나를 복사해 붙여넣어도 원래 그룹에 합류하지 않습니다.', () => {
    const id = useLayoutStore.getState().addObject('chair');
    useLayoutStore.getState().updateObject(id, { groupId: 'group-original' });
    useLayoutStore.getState().selectObject(id);
    useLayoutStore.getState().copySelected();
    useLayoutStore.getState().pasteObject();
    expect(useLayoutStore.getState().project.objects.at(-1)?.groupId).toBeUndefined();
  });

  it('이름이나 잠금만 바꿀 때 벽 부착 객체 위치를 다시 스냅하지 않습니다.', () => {
    const project = createBlankProject(6000, 4000);
    project.objects = [{ id: 'door', type: 'door', name: '문', x: 1234, y: 567, width: 900, depth: 100, rotation: 13, locked: false }];
    useLayoutStore.setState({ project });
    useLayoutStore.getState().updateObject('door', { locked: true });
    expect(useLayoutStore.getState().project.objects[0]).toMatchObject({ x: 1234, y: 567, rotation: 13, locked: true });
  });

  it('회전된 객체는 실제 회전 경계를 기준으로 왼쪽 정렬합니다.', () => {
    const project = createBlankProject(6000, 4000);
    project.objects = [
      { id: 'a', type: 'desk', name: 'A', x: 1000, y: 1000, width: 1000, depth: 400, rotation: 90, locked: false },
      { id: 'b', type: 'desk', name: 'B', x: 2000, y: 1000, width: 600, depth: 400, rotation: 0, locked: false },
    ];
    useLayoutStore.setState({ project, selectedId: 'b', selectedIds: ['a', 'b'] });
    useLayoutStore.getState().alignSelected('left');
    const [a, b] = useLayoutStore.getState().project.objects;
    expect(rotatedBounds(a).left).toBeCloseTo(rotatedBounds(b).left);
  });

  it('회전된 객체도 화면상 중심을 기준으로 균등 분배합니다.', () => {
    const project = createBlankProject(8000, 4000);
    project.objects = [
      { id: 'a', type: 'desk', name: 'A', x: 500, y: 1000, width: 1000, depth: 400, rotation: 0, locked: false },
      { id: 'b', type: 'desk', name: 'B', x: 2600, y: 1000, width: 1000, depth: 400, rotation: 45, locked: false },
      { id: 'c', type: 'desk', name: 'C', x: 6000, y: 1000, width: 1000, depth: 400, rotation: 0, locked: false },
    ];
    useLayoutStore.setState({ project, selectedId: 'b', selectedIds: ['a', 'b', 'c'] });
    useLayoutStore.getState().distributeSelected('horizontal');
    const centers = useLayoutStore.getState().project.objects.map((object) => rotatedBounds(object).centerX);
    expect(centers[1] - centers[0]).toBeCloseTo(centers[2] - centers[1]);
  });

  it('취소한 드래그는 임시 히스토리를 제거하고 redo 상태를 복구합니다.', () => {
    const futureProject = createBlankProject(5000, 3000);
    useLayoutStore.setState({ future: [futureProject] });
    useLayoutStore.getState().beginHistory();
    expect(useLayoutStore.getState().future).toHaveLength(0);
    expect(useLayoutStore.getState().past).toHaveLength(1);
    useLayoutStore.getState().updateRoomVertices([
      { x: 100, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 },
    ], false);
    useLayoutStore.getState().cancelHistory();
    expect(useLayoutStore.getState().past).toHaveLength(0);
    expect(useLayoutStore.getState().future).toEqual([futureProject]);
    expect(useLayoutStore.getState().project.room.vertices[0]).toEqual({ x: 0, y: 0 });
  });

  it('실제 변경이 없는 드래그는 빈 실행 취소 항목을 남기지 않습니다.', () => {
    const futureProject = createBlankProject(5000, 3000);
    useLayoutStore.setState({ future: [futureProject] });
    useLayoutStore.getState().beginHistory();
    useLayoutStore.getState().commitHistory();
    expect(useLayoutStore.getState().past).toHaveLength(0);
    expect(useLayoutStore.getState().future).toEqual([futureProject]);
  });

  it('프로젝트를 전환하면 이전 프로젝트의 히스토리와 클립보드를 이어받지 않습니다.', () => {
    const oldId = useLayoutStore.getState().addObject('desk');
    useLayoutStore.getState().selectObject(oldId);
    useLayoutStore.getState().copySelected();
    const next = createBlankProject(5000, 3000);
    next.projectName = '새 프로젝트';
    useLayoutStore.getState().setProject(next);
    useLayoutStore.getState().undo();
    const state = useLayoutStore.getState();
    expect(state.project.projectName).toBe('새 프로젝트');
    expect(state.project.objects).toHaveLength(0);
    expect(state.past).toHaveLength(0);
    expect(state.clipboard).toBeNull();
  });

  it('외곽 벽을 이동하면 벽 부착 객체를 변경된 외곽선에 다시 맞춥니다.', () => {
    const doorId = useLayoutStore.getState().addObject('door');
    useLayoutStore.getState().updateRoomVertices([
      { x: 0, y: 500 },
      { x: 6000, y: 500 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
    const door = useLayoutStore.getState().project.objects.find((object) => object.id === doorId);
    expect(door?.y).toBe(400);
    expect(door?.rotation).toBe(0);
  });

  it('추가 벽을 이동하면 그 벽에 붙은 문도 함께 이동합니다.', () => {
    const project = createBlankProject(6000, 4000);
    project.objects = [
      {
        id: 'wall-1', type: 'wall', name: '벽', locked: false,
        ...wallFromEndpoints({ x: 1000, y: 1000 }, { x: 4000, y: 1000 }, 50, -1),
      },
      { id: 'door-1', type: 'door', name: '문', x: 1800, y: 950, width: 900, depth: 50, rotation: 0, locked: false },
    ];
    useLayoutStore.setState({ project });
    useLayoutStore.getState().updateObject('wall-1', { y: 450 });
    const door = useLayoutStore.getState().project.objects.find((object) => object.id === 'door-1');
    expect(door).toMatchObject({ x: 1800, y: 450, depth: 50, rotation: 0, wallAttachmentId: 'wall-1' });
  });

  it('외곽 벽 잠금을 켜고 끌 수 있습니다.', () => {
    useLayoutStore.getState().selectRoomWall(1);
    useLayoutStore.getState().toggleSelectedRoomWallLock();
    expect(useLayoutStore.getState().project.room.lockedWallIndices).toEqual([1]);
    useLayoutStore.getState().toggleSelectedRoomWallLock();
    expect(useLayoutStore.getState().project.room.lockedWallIndices).toEqual([]);
  });

  it('빈 공간을 선택하면 객체와 외곽 벽 선택을 함께 해제합니다.', () => {
    useLayoutStore.getState().selectRoomWall(0);
    useLayoutStore.getState().selectObject(null);
    expect(useLayoutStore.getState().selectedId).toBeNull();
    expect(useLayoutStore.getState().selectedRoomWallIndex).toBeNull();
  });

  it('선택한 외곽 벽을 삭제합니다.', () => {
    useLayoutStore.getState().selectRoomWall(2);
    useLayoutStore.getState().deleteSelectedRoomWall();
    expect(useLayoutStore.getState().project.room.removedWallIndices).toEqual([2]);
    expect(useLayoutStore.getState().selectedRoomWallIndex).toBeNull();
  });

  it('외곽 벽을 분할하고 다시 인접 벽과 병합합니다.', () => {
    useLayoutStore.getState().selectRoomWall(0);
    useLayoutStore.getState().splitSelectedLine();
    expect(useLayoutStore.getState().project.room.vertices).toHaveLength(5);
    expect(useLayoutStore.getState().project.room.vertices[1]).toEqual({ x: 3000, y: 0 });
    useLayoutStore.getState().mergeSelectedRoomWall();
    expect(useLayoutStore.getState().project.room.vertices).toHaveLength(4);
  });

  it('외곽 벽 분할은 두께를 상속하고 다른 두께는 병합하지 않습니다.', () => {
    const project = createBlankProject(6000, 4000);
    project.room.wallThicknesses = [180, 100, 100, 100];
    useLayoutStore.setState({ project, selectedRoomWallIndex: 0 });
    useLayoutStore.getState().splitSelectedLine();
    expect(useLayoutStore.getState().project.room.wallThicknesses?.slice(0, 2)).toEqual([180, 180]);
    useLayoutStore.getState().updateRoomWallThickness(1, 120);
    useLayoutStore.getState().selectRoomWall(0);
    useLayoutStore.getState().mergeSelectedRoomWall();
    expect(useLayoutStore.getState().project.room.vertices).toHaveLength(5);
    expect(useLayoutStore.getState().toast).toContain('두께');
  });

  it('일반 벽과 유리벽을 실제 끝점 기준으로 분할합니다.', () => {
    const wallId = useLayoutStore.getState().addObject('wall');
    const originalWidth = useLayoutStore.getState().project.objects.find((item) => item.id === wallId)!.width;
    useLayoutStore.getState().updateObject(wallId, { locked: false });
    useLayoutStore.getState().selectObject(wallId);
    useLayoutStore.getState().splitSelectedLine();
    const walls = useLayoutStore.getState().project.objects.filter((item) => item.type === 'wall');
    expect(walls).toHaveLength(2);
    expect(walls[0].width + walls[1].width).toBeCloseTo(originalWidth);
  });

  it('프로젝트 90도 회전 시 도면과 orientation을 함께 보존합니다.', () => {
    const id = useLayoutStore.getState().addObject('desk', { x: 1000, y: 500 });
    useLayoutStore.getState().rotateProject(90);
    const state = useLayoutStore.getState();
    expect(state.project.orientation.rotationDegrees).toBe(90);
    expect(state.project.room.vertices).toEqual([{ x: 4000, y: 0 }, { x: 4000, y: 6000 }, { x: 0, y: 6000 }, { x: 0, y: 0 }]);
    expect(state.project.objects.find((item) => item.id === id)?.rotation).toBe(90);
  });

  it('가구 초기화는 벽과 시설을 보존합니다.', () => {
    useLayoutStore.getState().addObject('desk');
    useLayoutStore.getState().addObject('column');
    useLayoutStore.getState().resetFurniture();
    expect(useLayoutStore.getState().project.objects.map((item) => item.type)).toEqual(['column']);
  });

});
