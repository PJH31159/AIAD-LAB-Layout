(function () {
  'use strict';

  const line = (id, type, label, ax, ay, bx, by, extra = {}) => ({
    id, type, label, name: label, x: ax, y: ay,
    width: Math.hypot(bx - ax, by - ay), height: extra.thickness || 12,
    startPoint: { x: ax, y: ay }, endPoint: { x: bx, y: by },
    start: { x: ax, y: ay }, end: { x: bx, y: by }, rotation: 0,
    locked: true, ...extra
  });

  const officialRoom = {
    id: 'aiad-official-2026-08', revision: 5, wallHeight: 270,
    boundary: [
      { id: 'v1', x: 0, y: 0 }, { id: 'v2', x: 324, y: 0 },
      { id: 'v3', x: 324, y: 149 }, { id: 'v4', x: 624, y: 149 },
      { id: 'v5', x: 624, y: 169 }, { id: 'v6', x: 1124, y: 169 },
      { id: 'v7', x: 1124, y: 210 }, { id: 'v8', x: 1165, y: 210 },
      { id: 'v9', x: 1165, y: 634 }, { id: 'v10', x: 1124, y: 634 },
      { id: 'v11', x: 1124, y: 800 }, { id: 'v12', x: 624, y: 800 },
      { id: 'v13', x: 360, y: 800 }, { id: 'v14', x: 360, y: 680 },
      { id: 'v15', x: 106, y: 680 }, { id: 'v16', x: 106, y: 800 },
      { id: 'v17', x: 0, y: 800 }
    ],
    walls: [
      line('wall-block-top', 'wall', '상부 돌출 벽', 294, 149, 359, 149, { thickness: 12 }),
      line('wall-block-right', 'wall', '돌출 벽 우측', 359, 149, 359, 215, { thickness: 12 }),
      line('wall-block-bottom', 'wall', '돌출 벽 하부', 359, 215, 294, 215, { thickness: 12 }),
      line('wall-block-left', 'wall', '돌출 벽 좌측', 294, 215, 294, 149, { thickness: 12 })
    ],
    glassWalls: [
      line('glass-main', 'glass-wall', '중앙 유리 파티션', 624, 149, 624, 800, { thickness: 10, opacity: .66 })
    ],
    doors: [
      { id: 'door-south-left', type: 'door', label: '좌측 출입문', name: '좌측 출입문', x: 420, y: 800, width: 90, height: 8, startPoint: { x: 420, y: 800 }, endPoint: { x: 510, y: 800 }, rotation: 0, openingDirection: 'inward-up-left', openingAngle: 90, locked: true },
      { id: 'door-south-right', type: 'door', label: '우측 출입문', name: '우측 출입문', x: 1034, y: 800, width: 90, height: 8, startPoint: { x: 1034, y: 800 }, endPoint: { x: 1124, y: 800 }, rotation: 0, openingDirection: 'inward-up-left', openingAngle: 90, locked: true },
      { id: 'door-glass', type: 'door', label: '유리문', name: '유리문', x: 624, y: 650, width: 82, height: 8, startPoint: { x: 624, y: 650 }, endPoint: { x: 624, y: 732 }, rotation: 90, openingDirection: 'inward-up-right', openingAngle: 90, locked: true }
    ],
    windows: [
      line('window-east', 'window', '동측 창문', 1165, 300, 1165, 520, { thickness: 8 })
    ],
    fixedFacilities: [
      { id: 'distribution', type: 'distribution', label: '배전함', name: '배전함', x: 382, y: 735, width: 24, height: 62, w: 24, h: 62, startPoint: null, endPoint: null, rotation: 0, locked: true },
      { id: 'column-main', type: 'column', label: '기둥', name: '기둥', x: 326.5, y: 182, width: 65, height: 66, w: 65, h: 66, startPoint: null, endPoint: null, rotation: 0, locked: true },
      { id: 'outlet-north', type: 'outlet', label: '콘센트', name: '콘센트', x: 184, y: 0, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'outlet-west', type: 'outlet', label: '콘센트', name: '콘센트', x: 0, y: 548, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'outlet-column', type: 'outlet', label: '콘센트', name: '콘센트', x: 419, y: 712, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'outlet-east-top', type: 'outlet', label: '콘센트', name: '콘센트', x: 664, y: 169, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'outlet-east-a', type: 'outlet', label: '콘센트', name: '콘센트', x: 664, y: 800, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'outlet-east-b', type: 'outlet', label: '콘센트', name: '콘센트', x: 820, y: 800, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'lan-west-a', type: 'lan', label: 'LAN', name: 'LAN 포트', x: 0, y: 240, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'lan-west-b', type: 'lan', label: 'LAN', name: 'LAN 포트', x: 0, y: 575, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'lan-east', type: 'lan', label: 'LAN', name: 'LAN 포트', x: 870, y: 800, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true }
    ],
    dimensions: [
      { id: 'dim-west', label: '800 cm', startPoint: { x: -45, y: 0 }, endPoint: { x: -45, y: 800 } },
      { id: 'dim-north', label: '324 cm', startPoint: { x: 0, y: -38 }, endPoint: { x: 324, y: -38 } },
      { id: 'dim-east-bottom', label: '500 cm', startPoint: { x: 624, y: 842 }, endPoint: { x: 1124, y: 842 } },
      { id: 'dim-recess', label: '254 cm', startPoint: { x: 106, y: 658 }, endPoint: { x: 360, y: 658 } }
    ]
  };

  window.AIAD_DEFAULT_FLOORPLAN = Object.freeze(officialRoom);
})();
