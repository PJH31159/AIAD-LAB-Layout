import type { LayoutObjectType } from '../types/layout';
import { WALL_THICKNESS } from './layoutConstants';

export type CatalogItem = {
  type: LayoutObjectType;
  label: string;
  width: number;
  depth: number;
  category: 'space' | 'furniture' | 'facility';
  height?: number;
  color?: string;
  seats?: number;
};

export const objectCatalog: CatalogItem[] = [
  { type: 'wall', label: '벽', width: 2400, depth: WALL_THICKNESS, category: 'space' },
  { type: 'glass-wall', label: '유리벽', width: 2400, depth: WALL_THICKNESS, category: 'space', height: 2700, color: '#93C5FD' },
  { type: 'door', label: '문', width: 900, depth: WALL_THICKNESS, category: 'space' },
  { type: 'window', label: '창문', width: 1200, depth: WALL_THICKNESS, category: 'space' },
  { type: 'column', label: '기둥', width: 500, depth: 500, category: 'space' },
  { type: 'distribution', label: '분전반', width: 240, depth: 620, category: 'facility', height: 1400, color: '#475569' },
  { type: 'outlet', label: '콘센트', width: 120, depth: 120, category: 'facility' },
  { type: 'lan-port', label: '랜 포트', width: 120, depth: 120, category: 'facility' },
  { type: 'ac', label: '에어컨', width: 1100, depth: 350, category: 'facility', height: 350, color: '#E2E8F0' },
  { type: 'desk', label: '책상', width: 1400, depth: 700, category: 'furniture', height: 740, color: '#C9A66B' },
  { type: 'existing-desk', label: '기존 책상', width: 1800, depth: 1000, category: 'furniture', height: 740, color: '#A67C52' },
  { type: 'meeting-table', label: '회의 테이블', width: 1800, depth: 900, category: 'furniture', height: 740, color: '#A16207' },
  { type: 'chair', label: '의자', width: 600, depth: 600, category: 'furniture', height: 900, seats: 1, color: '#64748B' },
  { type: 'meeting-chair', label: '회의 의자', width: 600, depth: 600, category: 'furniture', height: 900, seats: 1, color: '#475569' },
  { type: 'sofa', label: '소파', width: 2400, depth: 800, category: 'furniture', height: 850, seats: 3, color: '#94A3B8' },
  { type: 'monitor', label: '모니터', width: 1600, depth: 200, category: 'furniture', height: 500, color: '#1E293B' },
  { type: 'fridge', label: '냉장고', width: 480, depth: 520, category: 'facility', height: 1800, color: '#CBD5E1' },
  { type: 'cabinet', label: '수납장', width: 900, depth: 450, category: 'furniture', height: 1800, color: '#B08968' },
  { type: 'shelf', label: '선반', width: 1200, depth: 400, category: 'furniture', height: 1800, color: '#9A7B4F' },
  { type: 'printer', label: '프린터', width: 600, depth: 600, category: 'furniture', height: 900, color: '#475569' },
  { type: 'whiteboard', label: '화이트보드', width: 1400, depth: 200, category: 'furniture', height: 1200, color: '#F8FAFC' },
  { type: 'partition', label: '파티션', width: 1600, depth: 100, category: 'furniture' },
  { type: 'custom', label: '사용자 정의', width: 1000, depth: 600, category: 'furniture' },
];

export const catalogByType = Object.fromEntries(
  objectCatalog.map((item) => [item.type, item]),
) as Record<LayoutObjectType, CatalogItem>;

export const furnitureTypes = new Set<LayoutObjectType>([
  'desk',
  'existing-desk',
  'meeting-table',
  'meeting-chair',
  'chair',
  'sofa',
  'monitor',
  'cabinet',
  'shelf',
  'printer',
  'whiteboard',
  'partition',
  'custom',
]);
