(function () {
  'use strict';

  const line = (id, type, label, ax, ay, bx, by, extra = {}) => ({
    id, type, label, name: label, x: ax, y: ay,
    width: Math.hypot(bx - ax, by - ay), height: extra.thickness || 12,
    startPoint: { x: ax, y: ay }, endPoint: { x: bx, y: by },
    start: { x: ax, y: ay }, end: { x: bx, y: by }, rotation: 0,
    locked: true, ...extra
  });

  const dimension = (id, ax, ay, bx, by, extra = {}) => {
    const value = Math.round(Math.hypot(bx - ax, by - ay));
    return { id, value, label: `${value} cm`, orientation: ax === bx ? 'vertical' : 'horizontal', startPoint: { x: ax, y: ay }, endPoint: { x: bx, y: by }, ...extra };
  };

  const officialRoom = {
    id: 'aiad-official-2026-08', revision: 6, wallHeight: 270,
    boundary: [
      { id: 'v1', x: 0, y: 0 }, { id: 'v2', x: 324, y: 0 },
      { id: 'v3', x: 324, y: 149 }, { id: 'v4', x: 624, y: 149 },
      { id: 'v5', x: 624, y: 294 }, { id: 'v6', x: 1123, y: 294 },
      { id: 'v7', x: 1123, y: 335 }, { id: 'v8', x: 1143, y: 335 },
      { id: 'v9', x: 1143, y: 759 }, { id: 'v10', x: 1124, y: 759 },
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
      line('glass-main', 'glass-wall', '중앙 유리 파티션', 624, 294, 624, 800, { thickness: 10, opacity: .66 })
    ],
    doors: [
      { id: 'door-south-left', type: 'door', label: '좌측 출입문', name: '좌측 출입문', x: 420, y: 800, width: 90, height: 8, startPoint: { x: 420, y: 800 }, endPoint: { x: 510, y: 800 }, rotation: 0, openingDirection: 'inward-up-right', openingAngle: 90, locked: true },
      { id: 'door-south-right', type: 'door', label: '우측 출입문', name: '우측 출입문', x: 920, y: 800, width: 90, height: 8, startPoint: { x: 920, y: 800 }, endPoint: { x: 1010, y: 800 }, rotation: 0, openingDirection: 'inward-up-right', openingAngle: 90, locked: true },
      { id: 'door-glass', type: 'door', label: '유리문', name: '유리문', x: 624, y: 650, width: 82, height: 8, startPoint: { x: 624, y: 650 }, endPoint: { x: 624, y: 732 }, rotation: 90, openingDirection: 'inward-up-right', openingAngle: 90, locked: true }
    ],
    windows: [
      line('window-east', 'window', '동측 창문', 1143, 425, 1143, 645, { thickness: 8 })
    ],
    fixedFacilities: [
      { id: 'distribution', type: 'distribution', label: '배전함', name: '배전함', x: 382, y: 735, width: 24, height: 62, w: 24, h: 62, startPoint: null, endPoint: null, rotation: 0, locked: true },
      { id: 'column-main', type: 'column', label: '기둥', name: '기둥', x: 326.5, y: 182, width: 65, height: 66, w: 65, h: 66, startPoint: null, endPoint: null, rotation: 0, locked: true },
      { id: 'outlet-north', type: 'outlet', label: '콘센트', name: '콘센트', x: 184, y: 0, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'outlet-west', type: 'outlet', label: '콘센트', name: '콘센트', x: 0, y: 548, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'outlet-column', type: 'outlet', label: '콘센트', name: '콘센트', x: 419, y: 712, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'outlet-east-top', type: 'outlet', label: '콘센트', name: '콘센트', x: 664, y: 294, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'outlet-east-a', type: 'outlet', label: '콘센트', name: '콘센트', x: 664, y: 800, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'outlet-east-b', type: 'outlet', label: '콘센트', name: '콘센트', x: 820, y: 800, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'lan-west-a', type: 'lan', label: 'LAN', name: 'LAN 포트', x: 0, y: 240, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'lan-west-b', type: 'lan', label: 'LAN', name: 'LAN 포트', x: 0, y: 575, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true },
      { id: 'lan-east', type: 'lan', label: 'LAN', name: 'LAN 포트', x: 870, y: 800, width: 12, height: 12, w: 12, h: 12, rotation: 0, locked: true }
    ],
    dimensions: [
      dimension('dim-west', -45, 0, -45, 800, { labelOffsetX: -28, labelOffsetY: 4 }),
      dimension('dim-north', 0, -38, 324, -38, { labelOffsetY: -8 }),
      dimension('dim-central-top', 359, 120, 624, 120, { labelOffsetY: -8 }),
      dimension('dim-glass-height', 590, 294, 590, 800, { labelOffsetX: -28, labelOffsetY: 4 }),
      dimension('dim-east-wall', 1185, 335, 1185, 759, { labelOffsetX: 30, labelOffsetY: 4 }),
      dimension('dim-east-top-rise', 1095, 294, 1095, 335, { labelOffsetX: -22, labelOffsetY: 4 }),
      dimension('dim-east-top-step', 1123, 365, 1143, 365, { labelOffsetY: 16 }),
      dimension('dim-east-bottom-step', 1124, 735, 1143, 735, { labelOffsetY: -8 }),
      dimension('dim-east-bottom-drop', 1170, 759, 1170, 800, { labelOffsetX: 27, labelOffsetY: 4 }),
      dimension('dim-east-inner-bottom', 624, 775, 920, 775, { labelOffsetY: -8 }),
      dimension('dim-east-bottom', 624, 842, 1124, 842, { labelOffsetY: 15 }),
      dimension('dim-recess', 106, 658, 360, 658, { labelOffsetY: -8 })
    ]
  };

  window.AIAD_DEFAULT_FLOORPLAN = Object.freeze(officialRoom);
})();
