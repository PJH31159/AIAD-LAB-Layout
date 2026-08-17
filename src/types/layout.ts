export type Point = { x: number; y: number };

export type LayoutObjectType =
  | 'wall'
  | 'glass-wall'
  | 'door'
  | 'window'
  | 'column'
  | 'distribution'
  | 'outlet'
  | 'lan-port'
  | 'ac'
  | 'desk'
  | 'existing-desk'
  | 'meeting-table'
  | 'meeting-chair'
  | 'chair'
  | 'sofa'
  | 'monitor'
  | 'printer'
  | 'whiteboard'
  | 'fridge'
  | 'cabinet'
  | 'shelf'
  | 'partition'
  | 'custom';

export type LayoutObject = {
  id: string;
  type: LayoutObjectType;
  name: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
  locked: boolean;
  color?: string;
  height?: number;
  heightSource?: 'measured' | 'catalog';
  seats?: number;
  spaceId?: string;
  groupId?: string;
  opacity?: number;
  wallSide?: 1 | -1;
  doorHinge?: 'left' | 'right';
  doorSwing?: 'inward' | 'outward';
  doorOpeningAngle?: number;
  wallAttachmentId?: string;
};

export type LayoutSpace = {
  id: string;
  name: string;
  type: 'workspace' | 'meeting' | 'common' | 'custom';
  bounds: { x: number; y: number; width: number; depth: number };
};

export type LayoutDimension = {
  id: string;
  start: Point;
  end: Point;
  label?: string;
  offset?: number;
  labelOffsetX?: number;
  labelOffsetY?: number;
};

export type LayoutOrientation = {
  rotationDegrees: number;
  label: string;
};

export type RoomData = {
  name: string;
  vertices: Point[];
  officialId?: string;
  officialRevision?: number;
  wallHeight?: number;
  spaces?: LayoutSpace[];
  dimensions?: LayoutDimension[];
  lockedWallIndices?: number[];
  removedWallIndices?: number[];
  wallThicknesses?: number[];
};

export type LayoutSettings = {
  unit: 'mm' | 'cm' | 'm';
  gridSize: number;
  snapEnabled: boolean;
  objectSnapEnabled: boolean;
  orthogonalSnapEnabled: boolean;
  minimumAisleWidth: number;
  showGrid: boolean;
  showLabels: boolean;
  showDimensions: boolean;
  autoSaveInterval?: number;
};

export type LayoutProject = {
  version: 4;
  projectName: string;
  room: RoomData;
  objects: LayoutObject[];
  settings: LayoutSettings;
  orientation: LayoutOrientation;
  updatedAt: string;
};

export type ViewState = {
  zoom: number;
  pan: Point;
};

export type LayoutWarning = {
  id: string;
  objectIds: string[];
  kind: 'overlap' | 'column-overlap' | 'door-swing' | 'outside' | 'aisle' | 'glass-clearance' | 'fridge-access' | 'monitor-sight';
  message: string;
};

export type ExportOptions = {
  showGrid: boolean;
  showLabels: boolean;
  showDimensions: boolean;
  includeBackground: boolean;
};
