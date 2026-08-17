import type { LayoutObject, LayoutProject, Point } from '../types/layout';

const mm = (centimeters: number) => centimeters * 10;

const boundaryCm: Point[] = [
  { x: 0, y: 0 }, { x: 324, y: 0 }, { x: 324, y: 149 },
  { x: 624, y: 149 }, { x: 624, y: 294 }, { x: 1123, y: 294 },
  { x: 1123, y: 335 }, { x: 1143, y: 335 }, { x: 1143, y: 759 },
  { x: 1124, y: 759 }, { x: 1124, y: 800 }, { x: 624, y: 800 },
  { x: 360, y: 800 }, { x: 360, y: 680 }, { x: 106, y: 680 },
  { x: 106, y: 800 }, { x: 0, y: 800 },
];

const officialObjects: LayoutObject[] = [
  { id: 'glass-main', type: 'glass-wall', name: '주 유리벽', x: 3710, y: 5420, width: 5060, depth: 100, rotation: 90, locked: true, height: 2700, heightSource: 'measured', color: '#93C5FD', opacity: .66, spaceId: 'main' },
  { id: 'door-south-left', type: 'door', name: '남측 출입문 1', x: 4200, y: 8000, width: 900, depth: 100, rotation: 180, locked: true, spaceId: 'main', wallAttachmentId: 'room-wall-11', doorHinge: 'right', doorSwing: 'inward', doorOpeningAngle: 90 },
  { id: 'door-south-right', type: 'door', name: '남측 출입문 2', x: 9200, y: 8000, width: 900, depth: 100, rotation: 180, locked: true, spaceId: 'east', wallAttachmentId: 'room-wall-10', doorHinge: 'right', doorSwing: 'inward', doorOpeningAngle: 90 },
  { id: 'door-glass', type: 'door', name: '유리벽 출입문', x: 5830, y: 6860, width: 820, depth: 100, rotation: 90, locked: true, spaceId: 'main', wallAttachmentId: 'glass-main', doorHinge: 'right', doorSwing: 'inward', doorOpeningAngle: 90 },
  { id: 'window-east', type: 'window', name: '동측 창문', x: 10380, y: 5300, width: 2200, depth: 100, rotation: 90, locked: true, spaceId: 'east', wallAttachmentId: 'room-wall-7' },
  { id: 'distribution-main', type: 'distribution', name: '분전반', x: 3700, y: 7040, width: 240, depth: 620, rotation: 0, locked: true, height: 1400, heightSource: 'measured', color: '#475569', spaceId: 'main' },
  { id: 'column-main', type: 'column', name: '기둥', x: 2940, y: 1490, width: 650, depth: 660, rotation: 0, locked: true, color: '#64748B', spaceId: 'main' },
  { id: 'outlet-north', type: 'outlet', name: '콘센트', x: 1780, y: -120, width: 120, depth: 120, rotation: 0, locked: true, spaceId: 'main' },
  { id: 'outlet-west', type: 'outlet', name: '콘센트', x: -120, y: 5420, width: 120, depth: 120, rotation: 270, locked: true, spaceId: 'main' },
  { id: 'outlet-inner', type: 'outlet', name: '콘센트', x: 3480, y: 7060, width: 120, depth: 120, rotation: 270, locked: true, spaceId: 'main' },
  { id: 'outlet-glass-top', type: 'outlet', name: '콘센트', x: 6580, y: 2820, width: 120, depth: 120, rotation: 0, locked: true, spaceId: 'east' },
  { id: 'outlet-south-east-1', type: 'outlet', name: '콘센트', x: 6580, y: 8000, width: 120, depth: 120, rotation: 180, locked: true, spaceId: 'east' },
  { id: 'outlet-south-east-2', type: 'outlet', name: '콘센트', x: 8140, y: 8000, width: 120, depth: 120, rotation: 180, locked: true, spaceId: 'east' },
  { id: 'lan-west-north', type: 'lan-port', name: 'LAN 포트', x: -120, y: 2340, width: 120, depth: 120, rotation: 270, locked: true, spaceId: 'main' },
  { id: 'lan-west-south', type: 'lan-port', name: 'LAN 포트', x: -120, y: 5690, width: 120, depth: 120, rotation: 270, locked: true, spaceId: 'main' },
  { id: 'lan-south-east', type: 'lan-port', name: 'LAN 포트', x: 8640, y: 8000, width: 120, depth: 120, rotation: 180, locked: true, spaceId: 'east' },
];

export function createOfficialProject(): LayoutProject {
  return {
    version: 4,
    projectName: 'AIAD 연구실 공식 도면',
    room: {
      name: 'AIAD 연구실',
      officialId: 'aiad-official-2026-08',
      officialRevision: 7,
      wallHeight: 2700,
      vertices: boundaryCm.map(({ x, y }) => ({ x: mm(x), y: mm(y) })),
      lockedWallIndices: boundaryCm.map((_, index) => index),
      removedWallIndices: [],
      wallThicknesses: boundaryCm.map(() => 100),
      spaces: [
        { id: 'main', name: '주 연구 공간', type: 'common', bounds: { x: 0, y: 0, width: 6240, depth: 8000 } },
        { id: 'east', name: '학부생 연구 공간', type: 'workspace', bounds: { x: 6240, y: 2940, width: 5190, depth: 5060 } },
      ],
      dimensions: [
        { id: 'dim-west', start: { x: -450, y: 0 }, end: { x: -450, y: 8000 }, label: '800 cm', labelOffsetX: -280, labelOffsetY: 40 },
        { id: 'dim-north', start: { x: 0, y: -380 }, end: { x: 3240, y: -380 }, label: '324 cm', labelOffsetY: -80 },
        { id: 'dim-central-top', start: { x: 3590, y: 1200 }, end: { x: 6240, y: 1200 }, label: '265 cm', labelOffsetY: -80 },
        { id: 'dim-glass-height', start: { x: 5900, y: 2940 }, end: { x: 5900, y: 8000 }, label: '506 cm', labelOffsetX: -280, labelOffsetY: 40 },
        { id: 'dim-east-wall', start: { x: 11850, y: 3350 }, end: { x: 11850, y: 7590 }, label: '424 cm', labelOffsetX: 300, labelOffsetY: 40 },
        { id: 'dim-east-top-rise', start: { x: 10950, y: 2940 }, end: { x: 10950, y: 3350 }, label: '41 cm', labelOffsetX: -220, labelOffsetY: 40 },
        { id: 'dim-east-top-step', start: { x: 11230, y: 3650 }, end: { x: 11430, y: 3650 }, label: '20 cm', labelOffsetY: 160 },
        { id: 'dim-east-bottom-step', start: { x: 11240, y: 7350 }, end: { x: 11430, y: 7350 }, label: '19 cm', labelOffsetY: -80 },
        { id: 'dim-east-bottom-drop', start: { x: 11700, y: 7590 }, end: { x: 11700, y: 8000 }, label: '41 cm', labelOffsetX: 270, labelOffsetY: 40 },
        { id: 'dim-east-inner-bottom', start: { x: 6240, y: 7750 }, end: { x: 9200, y: 7750 }, label: '296 cm', labelOffsetY: -80 },
        { id: 'dim-east-bottom', start: { x: 6240, y: 8420 }, end: { x: 11240, y: 8420 }, label: '500 cm', labelOffsetY: 150 },
        { id: 'dim-recess', start: { x: 1060, y: 6580 }, end: { x: 3600, y: 6580 }, label: '254 cm', labelOffsetY: -80 },
      ],
    },
    objects: officialObjects.map((object) => ({ ...object })),
    settings: {
      unit: 'mm', gridSize: 200, snapEnabled: true, objectSnapEnabled: true, orthogonalSnapEnabled: true, minimumAisleWidth: 900,
      showGrid: true, showLabels: true, showDimensions: true,
      autoSaveInterval: 3,
    },
    orientation: { rotationDegrees: 0, label: '실측 도면 방향' },
    updatedAt: new Date().toISOString(),
  };
}
