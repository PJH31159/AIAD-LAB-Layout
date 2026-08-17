import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { catalogByType, furnitureTypes } from '../../data/objectCatalog';
import { useLayoutStore } from '../../store/layoutStore';
import type { LayoutObject, LayoutProject, Point } from '../../types/layout';
import { rotatedObjectPolygon } from '../../utils/collision';
import { getRoomWallOuterSegments, normalizeRoomWallThicknesses } from '../../utils/roomGeometry';
import { sliceWallPolygon, splitWallSections, wallOpeningForObject } from '../../utils/threeGeometry';
import { Icon } from '../icons/Icon';

type CameraMode = 'top' | 'front' | 'perspective';
type WallMode = 'all' | 'front-hidden' | 'transparent' | 'ghost';
type WallMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
type SceneEngine = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  content: THREE.Group;
  sun: THREE.DirectionalLight;
  sunTarget: THREE.Object3D;
  wallMeshes: WallMesh[];
  wallMode: WallMode;
};

const cameraOptions = ([['top', '위'], ['front', '정면'], ['perspective', '원근']] as const);
const defaultHeights: Partial<Record<LayoutObject['type'], number>> = {
  wall: 2700, 'glass-wall': 2700, door: 2100, window: 1200, column: 2700,
  distribution: 1400, outlet: 120, 'lan-port': 120, ac: 350, partition: 1200, custom: 900,
};

const objectHeight = (object: LayoutObject, wallHeight: number) =>
  object.height ?? catalogByType[object.type].height ?? defaultHeights[object.type] ?? wallHeight;

function material(value: string, opacity = 1, metalness = .02) {
  return new THREE.MeshStandardMaterial({
    color: value,
    opacity,
    transparent: opacity < 1,
    depthWrite: opacity >= .72,
    roughness: .78,
    metalness,
    side: THREE.DoubleSide,
  });
}

function prismGeometry(polygon: Point[], bottom: number, top: number) {
  const positions: number[] = [];
  const pushTriangle = (first: THREE.Vector3, second: THREE.Vector3, third: THREE.Vector3, up?: boolean) => {
    const normal = new THREE.Vector3().subVectors(second, first).cross(new THREE.Vector3().subVectors(third, first));
    const vertices = up !== undefined && (normal.y > 0) !== up ? [first, third, second] : [first, second, third];
    vertices.forEach((point) => positions.push(point.x, point.y, point.z));
  };
  const contour = polygon.map((point) => new THREE.Vector2(point.x, point.y));
  THREE.ShapeUtils.triangulateShape(contour, []).forEach(([a, b, c]) => {
    const points = [polygon[a], polygon[b], polygon[c]];
    pushTriangle(...points.map((point) => new THREE.Vector3(point.x, top, point.y)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3], true);
    pushTriangle(...points.map((point) => new THREE.Vector3(point.x, bottom, point.y)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3], false);
  });
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const first = new THREE.Vector3(point.x, bottom, point.y);
    const second = new THREE.Vector3(next.x, bottom, next.y);
    const third = new THREE.Vector3(next.x, top, next.y);
    const fourth = new THREE.Vector3(point.x, top, point.y);
    pushTriangle(first, second, third);
    pushTriangle(first, third, fourth);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function addPrism(
  parent: THREE.Object3D,
  polygon: Point[],
  bottom: number,
  top: number,
  fill: string,
  opacity = 1,
  wallMeshes?: WallMesh[],
) {
  const mesh = new THREE.Mesh(prismGeometry(polygon, bottom, top), material(fill, opacity));
  mesh.castShadow = opacity >= .72;
  mesh.receiveShadow = true;
  if (wallMeshes) {
    const center = polygon.reduce<THREE.Vector3>((sum, point) => sum.add(new THREE.Vector3(point.x, (bottom + top) / 2, point.y)), new THREE.Vector3()).multiplyScalar(1 / polygon.length);
    mesh.userData.wallCenter = center;
    wallMeshes.push(mesh);
  }
  parent.add(mesh);
  return mesh;
}

function addBox(
  parent: THREE.Object3D,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  fill: string,
  opacity = 1,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(1, width), Math.max(1, height), Math.max(1, depth)),
    material(fill, opacity),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = opacity >= .72;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function openingObjects(project: LayoutProject, attachmentId: string) {
  return project.objects.filter((object) =>
    object.wallAttachmentId === attachmentId && (object.type === 'door' || object.type === 'window'));
}

function addWall(
  parent: THREE.Object3D,
  wallMeshes: WallMesh[],
  project: LayoutProject,
  attachmentId: string,
  innerStart: Point,
  innerEnd: Point,
  outerStart: Point,
  outerEnd: Point,
  wallHeight: number,
  fill: string,
  opacity: number,
) {
  const length = Math.hypot(innerEnd.x - innerStart.x, innerEnd.y - innerStart.y);
  const openings = openingObjects(project, attachmentId)
    .map((object) => wallOpeningForObject(object, innerStart, innerEnd, wallHeight))
    .filter((opening): opening is NonNullable<typeof opening> => Boolean(opening));
  const wallCenter = [innerStart, innerEnd, outerStart, outerEnd]
    .reduce<THREE.Vector3>((sum, point) => sum.add(new THREE.Vector3(point.x, wallHeight / 2, point.y)), new THREE.Vector3())
    .multiplyScalar(.25);
  splitWallSections(length, wallHeight, openings).forEach((section) => {
    const polygon = sliceWallPolygon(innerStart, innerEnd, outerStart, outerEnd, section.start / length, section.end / length);
    const mesh = addPrism(parent, polygon, section.bottom, section.top, fill, opacity, wallMeshes);
    mesh.userData.wallCenter = wallCenter;
    mesh.userData.wallAttachmentId = attachmentId;
    mesh.userData.wallStart = innerStart;
    mesh.userData.wallEnd = innerEnd;
  });
}

function addObjectWall(
  parent: THREE.Object3D,
  wallMeshes: WallMesh[],
  project: LayoutProject,
  object: LayoutObject,
  wallHeight: number,
  opacity: number,
) {
  const [innerStart, innerEnd, outerEnd, outerStart] = rotatedObjectPolygon(object);
  addWall(
    parent, wallMeshes, project, object.id, innerStart, innerEnd, outerStart, outerEnd,
    object.height ?? wallHeight,
    object.color ?? (object.type === 'glass-wall' ? '#79BDD1' : '#F4F6F8'),
    object.type === 'glass-wall' ? Math.min(opacity, object.opacity ?? .38, .48) : opacity,
  );
}

function addOpeningPanel(parent: THREE.Object3D, wallMeshes: WallMesh[], object: LayoutObject, wallMode: WallMode) {
  const depth = Math.max(24, object.depth * .34);
  const polygon = rotatedObjectPolygon({ ...object, y: object.y + (object.depth - depth) / 2, depth });
  const ghost = wallMode === 'ghost';
  const parentWall = wallMeshes.find((mesh) => mesh.userData.wallAttachmentId === object.wallAttachmentId);
  const addPanel = (bottom: number, top: number, fill: string, opacity: number) => {
    const mesh = addPrism(parent, polygon, bottom, top, fill, opacity, wallMeshes);
    if (parentWall) {
      mesh.userData.wallCenter = parentWall.userData.wallCenter;
      mesh.userData.wallAttachmentId = object.wallAttachmentId;
    }
  };
  if (object.type === 'door') addPanel(0, object.height ?? 2100, '#78A99A', ghost ? .2 : .58);
  if (object.type === 'window') addPanel(900, 900 + (object.height ?? 1200), '#71C4DC', ghost ? .18 : .38);
}

function nearestWallMesh(wallMeshes: WallMesh[], object: LayoutObject) {
  const point = { x: object.x + object.width / 2, y: object.y + object.depth / 2 };
  let match: WallMesh | undefined;
  let minimumDistance = Number.POSITIVE_INFINITY;
  wallMeshes.forEach((mesh) => {
    const start = mesh.userData.wallStart as Point | undefined;
    const end = mesh.userData.wallEnd as Point | undefined;
    if (!start || !end) return;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    const distance = Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio));
    if (distance < minimumDistance) {
      minimumDistance = distance;
      match = mesh;
    }
  });
  return match;
}

function addFurniture(parent: THREE.Object3D, object: LayoutObject, wallHeight: number, wallMode: WallMode) {
  const group = new THREE.Group();
  const fill = object.color ?? catalogByType[object.type].color ?? '#8793A7';
  const opacity = wallMode === 'ghost' ? .28 : object.opacity ?? 1;
  const width = object.width;
  const depth = object.depth;
  const height = objectHeight(object, wallHeight);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color = fill) =>
    addBox(group, w, h, d, x, y, z, color, opacity);
  if (object.type === 'desk' || object.type === 'existing-desk' || object.type === 'meeting-table') {
    const topThickness = Math.min(70, height * .12);
    box(width, topThickness, depth, 0, height - topThickness / 2, 0);
    const legHeight = height - topThickness;
    const legInset = Math.min(110, Math.min(width, depth) * .18);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
      box(55, legHeight, 55, sx * (width / 2 - legInset), legHeight / 2, sz * (depth / 2 - legInset), '#596273'));
  } else if (object.type === 'chair' || object.type === 'meeting-chair') {
    const seatHeight = Math.min(460, height * .52);
    box(width * .72, 80, depth * .72, 0, seatHeight, 0);
    box(width * .72, Math.max(200, height - seatHeight), 70, 0, (seatHeight + height) / 2, depth * .34);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
      box(42, seatHeight - 40, 42, sx * width * .27, (seatHeight - 40) / 2, sz * depth * .27, '#596273'));
  } else if (object.type === 'sofa') {
    box(width, height * .44, depth, 0, height * .22, 0);
    box(width, height * .62, depth * .2, 0, height * .58, depth * .4);
    box(width * .06, height * .48, depth * .82, -width * .47, height * .42, 0);
    box(width * .06, height * .48, depth * .82, width * .47, height * .42, 0);
  } else if (object.type === 'monitor') {
    const base = Math.min(740, wallHeight * .32);
    box(width, height, Math.max(45, depth * .34), 0, base + height / 2, 0, fill);
    box(55, base, 55, 0, base / 2, 0, '#596273');
    box(Math.min(420, width * .32), 35, Math.max(160, depth), 0, 18, 0, '#596273');
  } else if (object.type === 'whiteboard') {
    box(width, height * .72, Math.max(45, depth * .36), 0, height * .62, 0, fill);
    box(45, height * .3, 45, -width * .38, height * .15, 0, '#596273');
    box(45, height * .3, 45, width * .38, height * .15, 0, '#596273');
  } else {
    box(width, height, depth, 0, height / 2, 0);
  }
  group.position.set(object.x + object.width / 2, 0, object.y + object.depth / 2);
  group.rotation.y = -object.rotation * Math.PI / 180;
  parent.add(group);
}

function addFacility(
  parent: THREE.Object3D,
  wallMeshes: WallMesh[],
  object: LayoutObject,
  wallHeight: number,
  wallMode: WallMode,
) {
  const polygon = rotatedObjectPolygon(object);
  const height = objectHeight(object, wallHeight);
  const opacity = wallMode === 'ghost' ? .28 : object.opacity ?? 1;
  const fill = object.color ?? catalogByType[object.type].color ?? '#64748B';
  const bottom = object.type === 'distribution' ? Math.max(500, wallHeight - height - 300)
    : object.type === 'outlet' || object.type === 'lan-port' ? 300
      : object.type === 'ac' ? Math.max(0, wallHeight - height - 250) : 0;
  const followsWallVisibility = object.type === 'outlet' || object.type === 'lan-port' || object.type === 'ac';
  const mesh = addPrism(
    parent,
    polygon,
    bottom,
    Math.min(wallHeight, bottom + height),
    fill,
    opacity,
    undefined,
  );
  if (followsWallVisibility) {
    const parentWall = nearestWallMesh(wallMeshes, object);
    if (parentWall) {
      mesh.userData.wallCenter = parentWall.userData.wallCenter;
      mesh.userData.wallAttachmentId = parentWall.userData.wallAttachmentId;
    }
    wallMeshes.push(mesh);
  }
}

function disposeContent(content: THREE.Group) {
  content.traverse((node) => {
    const mesh = node as THREE.Mesh;
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((entry) => entry.dispose());
    else mesh.material?.dispose();
  });
  content.clear();
}

function buildScene(engine: SceneEngine, project: LayoutProject, wallMode: WallMode) {
  disposeContent(engine.content);
  engine.wallMeshes = [];
  engine.wallMode = wallMode;
  const wallHeight = project.room.wallHeight ?? 2700;
  const wallOpacity = wallMode === 'transparent' ? .2 : wallMode === 'ghost' ? .12 : 1;
  addPrism(engine.content, project.room.vertices, -45, 0, '#E9EDF2', 1);
  const thicknesses = normalizeRoomWallThicknesses(project.room.vertices, project.room.wallThicknesses);
  getRoomWallOuterSegments(project.room.vertices, project.room.removedWallIndices, thicknesses).forEach((segment, index) => {
    if (!segment) return;
    addWall(
      engine.content, engine.wallMeshes, project, `room-wall-${index}`,
      segment.inStart, segment.inEnd, segment.outStart, segment.outEnd,
      wallHeight, '#F4F6F8', wallOpacity,
    );
  });
  project.objects.filter((object) => object.type === 'wall' || object.type === 'glass-wall')
    .forEach((object) => addObjectWall(engine.content, engine.wallMeshes, project, object, wallHeight, wallOpacity));
  project.objects.filter((object) => object.type === 'door' || object.type === 'window')
    .forEach((object) => addOpeningPanel(engine.content, engine.wallMeshes, object, wallMode));
  project.objects.filter((object) => !['wall', 'glass-wall', 'door', 'window'].includes(object.type)).forEach((object) => {
    if (furnitureTypes.has(object.type)) addFurniture(engine.content, object, wallHeight, wallMode);
    else addFacility(engine.content, engine.wallMeshes, object, wallHeight, wallMode);
  });
  const bounds = new THREE.Box3().setFromObject(engine.content);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, wallHeight * 2);
  engine.sun.position.set(center.x - span, wallHeight * 3.5, center.z + span * .7);
  engine.sunTarget.position.copy(center);
  engine.sunTarget.updateMatrixWorld();
  const shadowCamera = engine.sun.shadow.camera as THREE.OrthographicCamera;
  shadowCamera.left = shadowCamera.bottom = -span;
  shadowCamera.right = shadowCamera.top = span;
  shadowCamera.near = 10;
  shadowCamera.far = span * 6;
  shadowCamera.updateProjectionMatrix();
}

function fitCamera(engine: SceneEngine, mode: CameraMode) {
  const bounds = new THREE.Box3().setFromObject(engine.content);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const target = center.clone();
  target.y = Math.min(center.y, size.y * .38);
  const direction = mode === 'top' ? new THREE.Vector3(0, 1, .0001)
    : mode === 'front' ? new THREE.Vector3(0, .23, 1)
      : new THREE.Vector3(1, .82, 1);
  direction.normalize();
  const up = mode === 'top' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, direction).normalize();
  const vertical = new THREE.Vector3().crossVectors(direction, right).normalize();
  const tangentY = Math.tan(engine.camera.fov * Math.PI / 360);
  const tangentX = tangentY * Math.max(.1, engine.camera.aspect);
  const corners = [bounds.min.x, bounds.max.x].flatMap((x) =>
    [bounds.min.y, bounds.max.y].flatMap((y) =>
      [bounds.min.z, bounds.max.z].map((z) => new THREE.Vector3(x, y, z))));
  const distance = Math.max(...corners.map((corner) => {
    const relative = corner.sub(target);
    return relative.dot(direction) + Math.max(
      Math.abs(relative.dot(right)) / tangentX,
      Math.abs(relative.dot(vertical)) / tangentY,
    );
  })) * 1.12;
  const radius = Math.max(1, size.length() / 2);
  engine.camera.position.copy(target).addScaledVector(direction, distance);
  engine.camera.up.copy(up);
  engine.camera.near = Math.max(1, distance / 1500);
  engine.camera.far = distance * 12;
  engine.camera.updateProjectionMatrix();
  engine.controls.target.copy(target);
  engine.controls.enableRotate = mode === 'perspective';
  engine.controls.mouseButtons.LEFT = mode === 'perspective' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  engine.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  engine.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  engine.controls.minDistance = radius * .18;
  engine.controls.maxDistance = radius * 8;
  engine.controls.update();
}

export default function ThreeDView({ onReturn2D }: { onReturn2D: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SceneEngine | null>(null);
  const projectRef = useRef<LayoutProject | null>(null);
  const cameraModeRef = useRef<CameraMode>('perspective');
  const project = useLayoutStore((state) => state.project);
  const [camera, setCamera] = useState<CameraMode>('perspective');
  const [wallMode, setWallMode] = useState<WallMode>('all');
  const [ready, setReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  cameraModeRef.current = camera;

  const moveCameraFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, current: CameraMode) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = cameraOptions.findIndex(([mode]) => mode === current);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? cameraOptions.length - 1 : (currentIndex + (event.key === 'ArrowLeft' ? -1 : 1) + cameraOptions.length) % cameraOptions.length;
    const tabList = event.currentTarget.parentElement;
    setCamera(cameraOptions[nextIndex][0]);
    window.requestAnimationFrame(() => tabList?.querySelectorAll<HTMLElement>('[role="tab"]')[nextIndex]?.focus());
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch {
      setWebglFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor('#F6F7F9');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#F6F7F9');
    scene.add(new THREE.HemisphereLight('#FFFFFF', '#8B96A7', 1.7));
    const sun = new THREE.DirectionalLight('#FFFFFF', 1.05);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -.00012;
    sun.shadow.normalBias = 14;
    const sunTarget = new THREE.Object3D();
    sun.target = sunTarget;
    scene.add(sun, sunTarget);
    const content = new THREE.Group();
    scene.add(content);
    const cameraObject = new THREE.PerspectiveCamera(42, 1, 1, 100000);
    const controls = new OrbitControls(cameraObject, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = .08;
    controls.screenSpacePanning = true;
    const engine: SceneEngine = { renderer, scene, camera: cameraObject, controls, content, sun, sunTarget, wallMeshes: [], wallMode: 'all' };
    engineRef.current = engine;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      renderer.setSize(rect.width, rect.height, false);
      cameraObject.aspect = rect.width / rect.height;
      cameraObject.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const contextLost = (event: Event) => { event.preventDefault(); setWebglFailed(true); };
    canvas.addEventListener('webglcontextlost', contextLost);
    let frame = 0;
    const animate = () => {
      controls.update();
      if (engine.wallMode === 'front-hidden') {
        const cameraDirection = cameraObject.position.clone().sub(controls.target);
        cameraDirection.y = 0;
        cameraDirection.normalize();
        engine.wallMeshes.forEach((mesh) => {
          const center = (mesh.userData.wallCenter as THREE.Vector3).clone().sub(controls.target);
          center.y = 0;
          mesh.visible = center.dot(cameraDirection) <= 0;
        });
      } else engine.wallMeshes.forEach((mesh) => { mesh.visible = true; });
      renderer.render(scene, cameraObject);
      frame = window.requestAnimationFrame(animate);
    };
    resize();
    setReady(true);
    frame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', contextLost);
      observer.disconnect();
      controls.dispose();
      disposeContent(content);
      renderer.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine) return;
    const projectChanged = projectRef.current !== project;
    buildScene(engine, project, wallMode);
    projectRef.current = project;
    if (projectChanged) fitCamera(engine, cameraModeRef.current);
  }, [project, ready, wallMode]);

  useEffect(() => {
    const engine = engineRef.current;
    if (ready && engine) fitCamera(engine, camera);
  }, [camera, ready]);

  if (webglFailed) return <section className="three-d-fallback"><h2>3D 보기를 사용할 수 없습니다.</h2><p>이 브라우저에서 WebGL을 사용할 수 없어 2D 편집기로 복귀합니다.</p><button onClick={onReturn2D}>2D로 돌아가기</button></section>;
  return (
    <section className="three-d-view">
      <div className="three-d-controls" role="toolbar" aria-label="3D 보기 제어">
        <strong className="three-d-controls__title">3D 보기</strong>
        <div className="three-d-controls__divider" aria-hidden="true" />
        <div className="segmented-control three-d-camera-switch" role="tablist" aria-label="3D 카메라 방향">{cameraOptions.map(([mode, label]) => <button key={mode} role="tab" tabIndex={camera === mode ? 0 : -1} aria-selected={camera === mode} className={camera === mode ? 'is-active' : ''} onClick={() => setCamera(mode)} onKeyDown={(event) => moveCameraFocus(event, mode)}>{label}</button>)}</div>
        <label className="three-d-select">
          <span>벽 표시</span>
          <select value={wallMode} onChange={(event) => setWallMode(event.target.value as WallMode)} aria-label="3D 벽 표시 모드">
            <option value="all">모든 벽</option>
            <option value="front-hidden">앞쪽 벽 숨김</option>
            <option value="transparent">벽 투명화</option>
            <option value="ghost">윤곽 모드</option>
          </select>
        </label>
        <button className="three-d-fit-button" onClick={() => { const engine = engineRef.current; if (engine) fitCamera(engine, camera); }}><Icon name="fit" size={16} />전체 맞춤</button>
        <span className="three-d-hint">드래그 회전 · Shift+드래그 이동 · 휠 확대</span>
      </div>
      <canvas ref={canvasRef} tabIndex={0} aria-label="연구실 3D 보기" onContextMenu={(event) => event.preventDefault()} />
    </section>
  );
}
