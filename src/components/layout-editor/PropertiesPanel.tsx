import { useEffect, useState, type ChangeEvent } from 'react';
import { WALL_SNAP_STEP, WALL_THICKNESS } from '../../data/layoutConstants';
import { furnitureTypes, objectCatalog } from '../../data/objectCatalog';
import { useLayoutStore } from '../../store/layoutStore';
import type { LayoutObject, LayoutObjectType, LayoutSpace, LayoutWarning } from '../../types/layout';
import { getInteriorWallLength, normalizeRoomWallThicknesses } from '../../utils/roomGeometry';
import { normalizeRotation } from '../../utils/snapping';
import {
  furnitureWallSnapTypes,
  getFurnitureWallSnapCandidate,
  getLinearWallEndpoints,
  getObjectWallSnapSurfaces,
  linearWallFromEndpoints,
  snapWallSurfaceToGrid,
} from '../../utils/structurePlacement';
import { Icon } from '../icons/Icon';

function NumberField({
  label,
  value,
  min,
  max,
  suffix = 'mm',
  step = 'any',
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  suffix?: string;
  step?: number | 'any';
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 1000) / 1000));
  useEffect(() => setDraft(String(Math.round(value * 1000) / 1000)), [value]);
  const parsed = Number(draft);
  const error = !draft.trim()
    ? '값을 입력해 주세요.'
    : !Number.isFinite(parsed)
      ? '숫자로 입력해 주세요.'
      : min !== undefined && parsed < min
        ? `${min.toLocaleString('ko-KR')} 이상 입력해 주세요.`
        : max !== undefined && parsed > max
          ? `${max.toLocaleString('ko-KR')} 이하로 입력해 주세요.`
          : null;
  const commit = () => {
    if (error) return;
    if (parsed !== value) onChange(parsed);
  };
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span>{label}</span>
      <div className="number-input">
        <input
          type="number"
          value={draft}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') { setDraft(String(Math.round(value * 1000) / 1000)); event.currentTarget.blur(); }
          }}
        />
        <small>{suffix}</small>
      </div>
      {error && <em className="field-error">{error}</em>}
    </label>
  );
}

const unitScale = { mm: 1, cm: 10, m: 1000 } as const;

function MeasurementField({ label, value, min = 0, max = 100000, step, disabled = false, onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number; disabled?: boolean; onChange: (millimeters: number) => void;
}) {
  const unit = useLayoutStore((state) => state.project.settings.unit);
  const scale = unitScale[unit];
  return <NumberField label={label} value={value / scale} min={min / scale} max={max / scale} step={step ? step / scale : 'any'} suffix={unit} disabled={disabled} onChange={(next) => onChange(next * scale)} />;
}



function SelectedProperties({
  object,
  warnings,
}: {
  object: LayoutObject;
  warnings: LayoutWarning[];
}) {
  const [wallAnchor, setWallAnchor] = useState<'start' | 'end' | 'center'>('start');
  const updateObject = useLayoutStore((state) => state.updateObject);
  const roomVertices = useLayoutStore((state) => state.project.room.vertices);
  const removedWallIndices = useLayoutStore((state) => state.project.room.removedWallIndices ?? []);
  const projectObjects = useLayoutStore((state) => state.project.objects);
  const gridSize = useLayoutStore((state) => state.project.settings.gridSize);
  const snapEnabled = useLayoutStore((state) => state.project.settings.snapEnabled);
  const showToast = useLayoutStore((state) => state.showToast);
  const duplicateSelected = useLayoutStore((state) => state.duplicateSelected);
  const deleteSelected = useLayoutStore((state) => state.deleteSelected);
  const toggleSelectedLock = useLayoutStore((state) => state.toggleSelectedLock);
  const splitSelectedLine = useLayoutStore((state) => state.splitSelectedLine);
  const set = (changes: Partial<LayoutObject>) => { if (!object.locked) updateObject(object.id, changes); };
  const isLineWall = object.type === 'wall' || object.type === 'glass-wall';
  const setWallLength = (nextLength: number) => {
    const gridLength = Math.max(WALL_THICKNESS, Math.round(nextLength / WALL_SNAP_STEP) * WALL_SNAP_STEP);
    const { start, end } = getLinearWallEndpoints(object);
    const currentLength = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const direction = { x: (end.x - start.x) / currentLength, y: (end.y - start.y) / currentLength };
    const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const nextStart = wallAnchor === 'end' ? { x: end.x - direction.x * gridLength, y: end.y - direction.y * gridLength }
      : wallAnchor === 'center' ? { x: center.x - direction.x * gridLength / 2, y: center.y - direction.y * gridLength / 2 } : start;
    const nextEnd = wallAnchor === 'start' ? { x: start.x + direction.x * gridLength, y: start.y + direction.y * gridLength }
      : wallAnchor === 'center' ? { x: center.x + direction.x * gridLength / 2, y: center.y + direction.y * gridLength / 2 } : end;
    set(linearWallFromEndpoints(object, nextStart, nextEnd));
  };
  const setRotation = (rotation: number) => {
    if (object.type === 'glass-wall') {
      const endpoints = getLinearWallEndpoints(object);
      const center = { x: (endpoints.start.x + endpoints.end.x) / 2, y: (endpoints.start.y + endpoints.end.y) / 2 };
      const radians = normalizeRotation(rotation) * Math.PI / 180;
      const half = object.width / 2;
      set(linearWallFromEndpoints(object, { x: center.x - Math.cos(radians) * half, y: center.y - Math.sin(radians) * half }, { x: center.x + Math.cos(radians) * half, y: center.y + Math.sin(radians) * half }));
      return;
    }
    const rotated = snapWallSurfaceToGrid(
      { ...object, rotation: normalizeRotation(rotation) },
      gridSize,
      snapEnabled,
      true,
    );
    set({ x: rotated.x, y: rotated.y, rotation: rotated.rotation });
  };
  const onType = (event: ChangeEvent<HTMLSelectElement>) => {
    const type = event.target.value as LayoutObjectType;
    if (!furnitureTypes.has(object.type) || !furnitureTypes.has(type)) return;
    const catalog = objectCatalog.find((item) => item.type === type)!;
    set({
      type,
      width: catalog.width,
      depth: catalog.depth,
      height: catalog.height,
      seats: catalog.seats,
      color: catalog.color,
      opacity: undefined,
      doorHinge: undefined,
      doorSwing: undefined,
      doorOpeningAngle: undefined,
      wallSide: undefined,
      wallAttachmentId: undefined,
    });
  };
  const attachToNearestWall = () => {
    const candidate = getFurnitureWallSnapCandidate(
      object,
      roomVertices,
      Number.POSITIVE_INFINITY,
      removedWallIndices,
      getObjectWallSnapSurfaces(projectObjects, object.id),
    );
    if (!candidate) {
      showToast('붙일 수 있는 벽을 찾지 못했습니다.');
      return;
    }
    set({ x: candidate.x, y: candidate.y });
    showToast(`${object.name}을 가장 가까운 벽에 붙였습니다.`);
  };

  return (
    <>

      <section className="properties-section">
        <button className={`lock-toggle ${object.locked ? 'is-active' : ''}`} onClick={toggleSelectedLock}>
          <Icon name={object.locked ? 'lock' : 'unlock'} />
          <span><strong>{object.locked ? '객체 잠금 해제' : '객체 잠금'}</strong><small>{object.locked ? '다시 이동하거나 수정할 수 있습니다.' : '실수로 이동하지 않도록 고정합니다.'}</small></span>
        </button>
      </section>
      <section className="properties-section">
        <h3>기본 정보</h3>
        <label className="field">
          <span>이름</span>
          <input type="text" value={object.name} onChange={(event) => set({ name: event.target.value })} />
        </label>
        {furnitureTypes.has(object.type) && <label className="field"><span>가구 종류</span><select value={object.type} onChange={onType}>{objectCatalog.filter((item) => furnitureTypes.has(item.type)).map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}</select></label>}
      </section>
      <section className="properties-section">
        <h3>위치</h3>
        <div className="field-grid">
          <MeasurementField label="X" value={object.x} min={-100000} max={100000} disabled={object.locked} onChange={(x) => set({ x })} />
          <MeasurementField label="Y" value={object.y} min={-100000} max={100000} disabled={object.locked} onChange={(y) => set({ y })} />
        </div>
      </section>
      <section className="properties-section">
        <h3>크기</h3>
        {isLineWall ? (
          <><MeasurementField label="길이" value={object.width} min={100} max={100000} disabled={object.locked} onChange={setWallLength} /><MeasurementField label="두께" value={object.depth} min={50} max={500} step={10} disabled={object.locked} onChange={(depth) => set(linearWallFromEndpoints({ ...object, depth: Math.round(depth / 10) * 10 }, getLinearWallEndpoints(object).start, getLinearWallEndpoints(object).end))} /><label className="field"><span>길이 기준점</span><select value={wallAnchor} disabled={object.locked} onChange={(event) => setWallAnchor(event.target.value as typeof wallAnchor)}><option value="start">시작점 고정</option><option value="end">끝점 고정</option><option value="center">중심 고정</option></select></label></>
        ) : object.type === 'door' ? (
          <MeasurementField label="너비" value={object.width} min={500} max={3000} onChange={(width) => set({ width })} />
        ) : object.type === 'window' ? (
          <MeasurementField label="길이" value={object.width} min={100} max={100000} onChange={(width) => set({ width })} />
        ) : (
          <div className="field-grid">
            <MeasurementField label="너비" value={object.width} min={50} max={100000} onChange={(width) => set({ width: Math.min(100000, Math.max(50, width)) })} />
            <MeasurementField label="깊이" value={object.depth} min={50} max={100000} onChange={(depth) => set({ depth: Math.min(100000, Math.max(50, depth)) })} />
          </div>
        )}
        {furnitureTypes.has(object.type) && <label className="field"><span>색상</span><input type="color" value={object.color ?? '#94A3B8'} onChange={(event) => set({ color: event.target.value })} /></label>}
        {object.type === 'glass-wall' && <NumberField label="불투명도" value={Math.round((object.opacity ?? 1) * 100)} min={0} max={100} suffix="%" onChange={(opacity) => set({ opacity: opacity / 100 })} />}
        <label className="field"><span>소속 공간</span><select value={object.spaceId ?? ''} onChange={(event) => set({ spaceId: event.target.value || undefined })}><option value="">지정 안 함</option>{(useLayoutStore.getState().project.room.spaces ?? []).map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label>
      </section>
      <section className="properties-section">
        {object.type === 'door' ? (
          <>
            <h3>문 설정</h3>
            <p className="automatic-alignment-note"><Icon name="wall" size={15} />벽 방향에 맞춰 자동 정렬됩니다.</p>
          </>
        ) : object.type === 'window' ? (
          <><h3>창문 부착</h3><p className="automatic-alignment-note"><Icon name="wall" size={15} />부착된 벽의 방향과 두께를 따릅니다.</p></>
        ) : isLineWall ? (
          <>
            <h3>벽 방향</h3>
            <div className="segmented-control" role="group" aria-label="벽 방향">
              <button type="button" className={object.rotation % 180 === 0 ? 'is-active' : ''} aria-pressed={object.rotation % 180 === 0} disabled={object.locked} onClick={() => setRotation(0)}>가로</button>
              <button type="button" className={object.rotation % 180 !== 0 ? 'is-active' : ''} aria-pressed={object.rotation % 180 !== 0} disabled={object.locked} onClick={() => setRotation(90)}>세로</button>
            </div>
          </>
        ) : (
          <>
            <h3>회전</h3>
            <NumberField label="각도" value={object.rotation} suffix="°" onChange={(rotation) => set({ rotation: normalizeRotation(rotation) })} />
          </>
        )}
        {object.type === 'door' && (
          <div className="door-controls">
            <NumberField label="열림 각도" value={object.doorOpeningAngle ?? 90} min={10} max={180} suffix="°" onChange={(doorOpeningAngle) => set({ doorOpeningAngle })} />
            <div className="door-control">
              <span>열림 방향</span>
              <div className="segmented-control" role="group" aria-label="문 열림 방향">
                <button type="button" className={(object.doorSwing ?? 'inward') === 'inward' ? 'is-active' : ''} aria-pressed={(object.doorSwing ?? 'inward') === 'inward'} onClick={() => set({ doorSwing: 'inward' })}>실내</button>
                <button type="button" className={object.doorSwing === 'outward' ? 'is-active' : ''} aria-pressed={object.doorSwing === 'outward'} onClick={() => set({ doorSwing: 'outward' })}>실외</button>
              </div>
            </div>
            <div className="door-control">
              <span>경첩 방향</span>
              <div className="segmented-control" role="group" aria-label="문 경첩 방향">
                <button type="button" className={(object.doorHinge ?? 'left') === 'left' ? 'is-active' : ''} aria-pressed={(object.doorHinge ?? 'left') === 'left'} onClick={() => set({ doorHinge: 'left' })}>왼쪽</button>
                <button type="button" className={object.doorHinge === 'right' ? 'is-active' : ''} aria-pressed={object.doorHinge === 'right'} onClick={() => set({ doorHinge: 'right' })}>오른쪽</button>
              </div>
            </div>
          </div>
        )}
        {furnitureWallSnapTypes.has(object.type) && (
          <button className="wall-snap-button" type="button" onClick={attachToNearestWall} disabled={object.locked}>
            <Icon name="wall" size={18} />
            <span><strong>가장 가까운 벽에 붙이기</strong><small>회전을 유지하고 간격을 0 mm로 맞춥니다.</small></span>
          </button>
        )}
      </section>
      <section className="properties-section">
        <div className="property-actions">
          {isLineWall && <button onClick={splitSelectedLine} disabled={object.locked}>벽 분할</button>}
          {!isLineWall && object.type !== 'door' && object.type !== 'window' && <button onClick={() => set({ rotation: normalizeRotation(object.rotation + 90) })}>90° 회전</button>}
          <button onClick={duplicateSelected}><Icon name="copy" />복제</button>
          <button className="button-danger" onClick={deleteSelected} disabled={object.locked}><Icon name="trash" />삭제</button>
        </div>
      </section>
      {warnings.length > 0 && (
        <section className="properties-section warning-section" aria-live="polite">
          <div className="warning-title"><Icon name="warning" /><h3>배치 경고 {warnings.length}건</h3></div>
          <ul>{warnings.map((warning) => <li key={warning.id}><Icon name="warning" size={14} />{warning.message}</li>)}</ul>
        </section>
      )}
      <CanvasSettings />
    </>
  );
}

function RoomWallProperties({ index }: { index: number }) {
  const [wallAnchor, setWallAnchor] = useState<'start' | 'end' | 'center'>('start');
  const vertices = useLayoutStore((state) => state.project.room.vertices);
  const wallThicknesses = useLayoutStore((state) => state.project.room.wallThicknesses);
  const updateRoomVertices = useLayoutStore((state) => state.updateRoomVertices);
  const lockedWallIndices = useLayoutStore((state) => state.project.room.lockedWallIndices ?? []);
  const toggleSelectedRoomWallLock = useLayoutStore((state) => state.toggleSelectedRoomWallLock);
  const deleteSelectedRoomWall = useLayoutStore((state) => state.deleteSelectedRoomWall);
  const splitSelectedLine = useLayoutStore((state) => state.splitSelectedLine);
  const mergeSelectedRoomWall = useLayoutStore((state) => state.mergeSelectedRoomWall);
  const updateRoomWallThickness = useLayoutStore((state) => state.updateRoomWallThickness);
  const start = vertices[index];
  const end = vertices[(index + 1) % vertices.length];
  const interiorLength = getInteriorWallLength(vertices, index);
  const thickness = normalizeRoomWallThicknesses(vertices, wallThicknesses)[index];
  const angle = Math.round(((Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI) + 360) % 360);
  const locked = lockedWallIndices.includes(index);
  const previousWallIndex = (index - 1 + vertices.length) % vertices.length;
  const nextWallIndex = (index + 1) % vertices.length;
  const connectedWallLocked = !locked && lockedWallIndices.some((wallIndex) => wallIndex === previousWallIndex || wallIndex === nextWallIndex);

  const setLength = (newLength: number) => {
    const rawLen = Math.hypot(end.x - start.x, end.y - start.y);
    if (rawLen === 0) return;
    const dx = (end.x - start.x) / rawLen;
    const dy = (end.y - start.y) / rawLen;
    const nextVertices = [...vertices];
    const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    if (wallAnchor === 'start' || wallAnchor === 'center') nextVertices[(index + 1) % vertices.length] = wallAnchor === 'start'
      ? { x: Math.round(start.x + dx * newLength), y: Math.round(start.y + dy * newLength) }
      : { x: Math.round(center.x + dx * newLength / 2), y: Math.round(center.y + dy * newLength / 2) };
    if (wallAnchor === 'end' || wallAnchor === 'center') nextVertices[index] = wallAnchor === 'end'
      ? { x: Math.round(end.x - dx * newLength), y: Math.round(end.y - dy * newLength) }
      : { x: Math.round(center.x - dx * newLength / 2), y: Math.round(center.y - dy * newLength / 2) };
    updateRoomVertices(nextVertices);
  };

  const setAngle = (newAngle: number) => {
    const rawLen = Math.hypot(end.x - start.x, end.y - start.y);
    const rad = (((newAngle % 360) + 360) % 360) * (Math.PI / 180);
    const nextVertices = [...vertices];
    nextVertices[(index + 1) % vertices.length] = {
      x: Math.round(start.x + Math.cos(rad) * rawLen),
      y: Math.round(start.y + Math.sin(rad) * rawLen),
    };
    updateRoomVertices(nextVertices);
  };

  return (
    <>
      <section className="properties-section properties-section--summary">
        <div className="selection-summary">
          <span className="selection-summary__icon"><Icon name="wall" size={22} /></span>
          <div><strong>벽 {index + 1}</strong><span>{locked ? '잠긴 연결 벽' : '연결된 벽'}</span></div>
        </div>
      </section>
      <section className="properties-section">
        <button className={`lock-toggle ${locked ? 'is-active' : ''}`} onClick={toggleSelectedRoomWallLock}>
          <Icon name={locked ? 'lock' : 'unlock'} />
          <span><strong>{locked ? '벽 잠금 해제' : '벽 잠금'}</strong><small>{locked ? '다시 이동하거나 형태를 수정할 수 있습니다.' : '벽과 연결된 끝점이 실수로 움직이지 않게 고정합니다.'}</small></span>
        </button>
        <div className="property-actions">
          <button onClick={splitSelectedLine} disabled={locked}>분할</button>
          <button onClick={mergeSelectedRoomWall} disabled={locked}>인접 벽 병합</button>
          <button className="button-danger" onClick={deleteSelectedRoomWall} disabled={locked}><Icon name="trash" />삭제</button>
        </div>
      </section>
      <section className="properties-section">
        <h3>구간 정보</h3>
        <div className="field-grid"><NumberField label="길이" value={interiorLength} min={100} max={100000} disabled={locked} onChange={setLength} /><NumberField label="두께" value={thickness} min={50} max={500} step={10} disabled={locked} onChange={(value) => updateRoomWallThickness(index, value)} /><NumberField label="방향" value={angle} suffix="°" disabled={locked} onChange={setAngle} /></div>
        <label className="field"><span>길이 기준점</span><select value={wallAnchor} disabled={locked} onChange={(event) => setWallAnchor(event.target.value as typeof wallAnchor)}><option value="start">시작점 고정</option><option value="end">끝점 고정</option><option value="center">중심 고정</option></select></label>
        <p className="automatic-alignment-note"><Icon name={locked || connectedWallLocked ? 'lock' : 'wall'} size={15} />{locked
          ? '잠금을 해제하면 벽과 끝점을 편집할 수 있습니다.'
          : connectedWallLocked
            ? '연결된 잠긴 벽을 보호하기 위해 이 벽의 이동이 제한됩니다.'
            : '벽 선을 드래그해 이동하고, 수치 또는 끝점 핸들로 형태를 조정합니다.'}</p>
      </section>
    </>
  );
}

function CanvasSettings() {
  const settings = useLayoutStore((state) => state.project.settings);
  const updateSettings = useLayoutStore((state) => state.updateSettings);
  return (
    <details className="properties-section canvas-settings" open>
      <summary><h3>캔버스 설정</h3></summary>
      <label className="field"><span>표시 단위</span><select value={settings.unit} onChange={(event) => updateSettings({ unit: event.target.value as 'mm' | 'cm' | 'm' })}><option value="mm">밀리미터 (mm)</option><option value="cm">센티미터 (cm)</option><option value="m">미터 (m)</option></select></label>
      <label className="field"><span>격자 크기</span><select value={settings.gridSize} onChange={(event) => updateSettings({ gridSize: Number(event.target.value) })}><option value={100}>10 cm</option><option value={200}>20 cm</option><option value={500}>50 cm</option><option value={1000}>100 cm</option></select></label>
      <MeasurementField label="최소 통로 폭" value={settings.minimumAisleWidth} min={0} max={20000} onChange={(minimumAisleWidth) => updateSettings({ minimumAisleWidth: Math.min(20000, Math.max(0, minimumAisleWidth)) })} />
      <label className="field">
        <span>자동 저장 간격</span>
        <select
          value={settings.autoSaveInterval ?? 3}
          onChange={(event) => updateSettings({ autoSaveInterval: Number(event.target.value) })}
        >
          <option value={3}>3초마다 (기본)</option>
          <option value={5}>5초마다</option>
          <option value={10}>10초마다</option>
          <option value={30}>30초마다</option>
          <option value={0}>사용 안 함 (수동 저장만)</option>
        </select>
      </label>
      {([
        ['showGrid', '격자 표시', '캔버스에 실제 간격 격자를 표시합니다.'],
        ['showLabels', '객체 이름 표시', '캔버스의 객체 이름을 표시합니다.'],
        ['snapEnabled', '격자 스냅', '객체를 격자 간격에 맞춥니다.'],
        ['objectSnapEnabled', '객체 스냅', '객체의 면과 중심을 서로 맞춥니다.'],
        ['orthogonalSnapEnabled', '직각 스냅', '벽과 이동 방향을 직각에 맞춥니다.'],
        ['showDimensions', '공식·선택 치수 표시', '도면 치수와 선택 객체 치수를 표시합니다.'],
      ] as const).map(([key, label, description]) => <label className="switch-row" key={key}>
        <span><strong>{label}</strong><small>{description}</small></span>
        <input type="checkbox" role="switch" aria-label={label} checked={settings[key]} onChange={(event) => updateSettings({ [key]: event.target.checked })} />
      </label>)}
    </details>
  );
}

function SpaceProperties({ space }: { space: LayoutSpace }) {
  const updateSpace = useLayoutStore((state) => state.updateSpace);
  const set = (changes: Partial<LayoutSpace>) => updateSpace(space.id, changes);
  return <>
    <section className="properties-section properties-section--summary"><div className="selection-summary"><span className="selection-summary__icon"><Icon name="grid" size={22} /></span><div><strong>{space.name}</strong><span>공간 영역</span></div></div></section>
    <section className="properties-section"><h3>공간 정보</h3><label className="field"><span>이름</span><input value={space.name} onChange={(event) => set({ name: event.target.value })} /></label><label className="field"><span>종류</span><select value={space.type} onChange={(event) => set({ type: event.target.value as LayoutSpace['type'] })}><option value="workspace">업무 공간</option><option value="meeting">회의 공간</option><option value="common">공용 공간</option><option value="custom">사용자 공간</option></select></label></section>
    <section className="properties-section"><h3>범위</h3><div className="field-grid"><MeasurementField label="X" value={space.bounds.x} min={-100000} onChange={(x) => set({ bounds: { ...space.bounds, x } })} /><MeasurementField label="Y" value={space.bounds.y} min={-100000} onChange={(y) => set({ bounds: { ...space.bounds, y } })} /><MeasurementField label="너비" value={space.bounds.width} min={100} onChange={(width) => set({ bounds: { ...space.bounds, width } })} /><MeasurementField label="깊이" value={space.bounds.depth} min={100} onChange={(depth) => set({ bounds: { ...space.bounds, depth } })} /></div></section>
    <CanvasSettings />
  </>;
}

function EmptySelection() {
  return (
    <><section className="empty-selection">
      <h3>객체를 선택해 주세요</h3>
      <p>캔버스에서 객체를 클릭하면<br />여기에 속성이 표시됩니다.</p>
    </section><CanvasSettings /></>
  );
}

function MultiSelection({ count }: { count: number }) {
  const selectedIds = useLayoutStore((state) => state.selectedIds);
  const projectObjects = useLayoutStore((state) => state.project.objects);
  const selectedObjects = projectObjects.filter((object) => selectedIds.includes(object.id));
  const alignSelected = useLayoutStore((state) => state.alignSelected);
  const distributeSelected = useLayoutStore((state) => state.distributeSelected);
  const groupSelected = useLayoutStore((state) => state.groupSelected);
  const ungroupSelected = useLayoutStore((state) => state.ungroupSelected);
  const duplicateSelected = useLayoutStore((state) => state.duplicateSelected);
  const deleteSelected = useLayoutStore((state) => state.deleteSelected);
  const mergeSelectedWalls = useLayoutStore((state) => state.mergeSelectedWalls);
  const isWallPair = selectedIds.length === 2 && selectedObjects.every((object) => object.type === 'wall' || object.type === 'glass-wall');
  const hasLockedWall = isWallPair && selectedObjects.some((object) => object.locked);
  return <>
    <section className="properties-section"><h3>{count}개 객체 선택</h3><p className="automatic-alignment-note">Shift 클릭 또는 영역 드래그로 선택을 조정합니다.</p></section>
    <section className="properties-section"><h3>정렬</h3><div className="property-actions multi-actions">
      <button onClick={() => alignSelected('left')}>좌</button><button onClick={() => alignSelected('center-x')}>가운데</button><button onClick={() => alignSelected('right')}>우</button>
      <button onClick={() => alignSelected('top')}>상</button><button onClick={() => alignSelected('center-y')}>중앙</button><button onClick={() => alignSelected('bottom')}>하</button>
      <button onClick={() => distributeSelected('horizontal')}>가로 균등</button><button onClick={() => distributeSelected('vertical')}>세로 균등</button>
    </div></section>
    <section className="properties-section"><div className="property-actions multi-actions">{isWallPair && <button onClick={mergeSelectedWalls} disabled={hasLockedWall}>벽 병합</button>}<button onClick={groupSelected}>그룹</button><button onClick={ungroupSelected}>그룹 해제</button><button onClick={duplicateSelected}>복제</button><button className="button-danger" onClick={deleteSelected}>삭제</button></div></section>
    <CanvasSettings />
  </>;
}

export function PropertiesPanel({ warnings }: { warnings: LayoutWarning[] }) {
  const project = useLayoutStore((state) => state.project);
  const selectedId = useLayoutStore((state) => state.selectedId);
  const selectedIds = useLayoutStore((state) => state.selectedIds);
  const selectedRoomWallIndex = useLayoutStore((state) => state.selectedRoomWallIndex);
  const selectedSpaceId = useLayoutStore((state) => state.selectedSpaceId);
  const object = project.objects.find((item) => item.id === selectedId);
  const space = project.room.spaces?.find((item) => item.id === selectedSpaceId);
  const selectedWarnings = warnings.filter((warning) => warning.objectIds.includes(selectedId ?? ''));
  const hasSelection = Boolean(object) || Boolean(space) || selectedRoomWallIndex !== null;

  return (
    <aside id="properties-panel" className="side-panel side-panel--right" aria-label="속성 패널">
      <div className="properties-header">
        <div className="properties-header__title">
          <div>
            <h2>선택 요소 속성</h2>
            <span className="properties-header__subtitle">선택한 요소의 치수와 옵션을 편집합니다.</span>
          </div>
          {hasSelection && <span className="selection-status is-selected">선택됨</span>}
        </div>
      </div>
      {selectedIds.length > 1
        ? <MultiSelection count={selectedIds.length} />
        : object
        ? <SelectedProperties object={object} warnings={selectedWarnings} />
        : selectedRoomWallIndex !== null
          ? <RoomWallProperties index={selectedRoomWallIndex} />
          : space
            ? <SpaceProperties space={space} />
          : <EmptySelection />}
    </aside>
  );
}
