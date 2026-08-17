import { catalogByType } from '../data/objectCatalog';
import { WALL_COLOR, WALL_THICKNESS } from '../data/layoutConstants';
import type { ExportOptions, LayoutObject, LayoutProject } from '../types/layout';
import { roomBounds } from './coordinates';
import { getRoomWallOuterSegments, isRoomBoundaryClosed } from './roomGeometry';
import { getWallEndpoints } from './structurePlacement';
import { getClosedWallLoops, getObjectWallFaceGeometry, getRoomWallFaceGeometries, getWallJoinPolygons } from './wallGeometry';

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    };
    return entities[character];
  });

function objectMarkup(object: LayoutObject, options: ExportOptions): string {
  const centerX = object.x + object.width / 2;
  const centerY = object.y + object.depth / 2;
  const label = catalogByType[object.type].label;
  if (object.type === 'wall') {
    return `
    <g transform="rotate(${object.rotation} ${centerX} ${centerY})">
      <rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.depth}"
        fill="${WALL_COLOR}" stroke="${WALL_COLOR}" stroke-width="0.5" />
      ${options.showDimensions ? `<text x="${centerX}" y="${object.y + object.depth + 190}" text-anchor="middle" font-size="120" fill="#343740">${Math.round(object.width)} mm</text>` : ''}
    </g>`;
  }
  return `
    <g transform="rotate(${object.rotation} ${centerX} ${centerY})">
      <rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.depth}"
        rx="40" fill="#ffffff" stroke="#6b7684" stroke-width="20" />
      ${options.showLabels ? `<text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="middle" font-size="150" fill="#343740">${escapeXml(object.name || label)}</text>` : ''}
      ${options.showDimensions ? `<text x="${centerX}" y="${object.y + object.depth + 190}" text-anchor="middle" font-size="120" fill="#6b7684">${Math.round(object.width)} × ${Math.round(object.depth)} mm</text>` : ''}
    </g>`;
}

export function projectToSvg(project: LayoutProject, options: ExportOptions): string {
  const bounds = roomBounds(project.room.vertices);
  const padding = 500;
  const left = bounds.left - padding;
  const top = bounds.top - padding;
  const width = bounds.width + padding * 2;
  const height = bounds.height + padding * 2;
  const points = project.room.vertices.map((point) => `${point.x},${point.y}`).join(' ');
  const wallMarkup = getRoomWallOuterSegments(
    project.room.vertices,
    project.room.removedWallIndices ?? [],
    project.room.wallThicknesses ?? WALL_THICKNESS,
  ).map((segment, index) => segment
    ? `<polygon data-room-wall="${index}" points="${segment.inStart.x},${segment.inStart.y} ${segment.inEnd.x},${segment.inEnd.y} ${segment.outEnd.x},${segment.outEnd.y} ${segment.outStart.x},${segment.outStart.y}" fill="${WALL_COLOR}" stroke="${WALL_COLOR}" stroke-width="0.5"/>`
    : '').join('');
  const roomSurfaceClosed = isRoomBoundaryClosed(
    project.room.vertices,
    project.room.removedWallIndices ?? [],
    project.objects.filter((object) => object.type === 'wall').map((wall) => ({
      ...getWallEndpoints(wall),
      thickness: wall.depth,
    })),
  );
  const wallJoinsMarkup = getWallJoinPolygons([
    ...getRoomWallFaceGeometries(project.room.vertices, project.room.removedWallIndices ?? [], project.room.wallThicknesses ?? WALL_THICKNESS),
    ...project.objects.flatMap((object) => {
      const geometry = getObjectWallFaceGeometry(object);
      return geometry ? [geometry] : [];
    }),
  ]).map((polygon) => `<polygon points="${polygon.map((point) => `${point.x},${point.y}`).join(' ')}" fill="${WALL_COLOR}" stroke="${WALL_COLOR}" stroke-width="0.5"/>`).join('');
  const objectRoomSurfaces = getClosedWallLoops(project.objects)
    .map((polygon) => `<polygon points="${polygon.map((point) => `${point.x},${point.y}`).join(' ')}" fill="#ffffff" stroke="none"/>`)
    .join('');
  const grid = options.showGrid
    ? `<defs><pattern id="grid" width="${project.settings.gridSize}" height="${project.settings.gridSize}" patternUnits="userSpaceOnUse"><path d="M ${project.settings.gridSize} 0 L 0 0 0 ${project.settings.gridSize}" fill="none" stroke="#e8ebef" stroke-width="10"/></pattern></defs><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="url(#grid)"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${width} ${height}" width="${Math.round(width / 5)}" height="${Math.round(height / 5)}">
    ${options.includeBackground ? `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#f6f7f9"/>` : ''}
    ${grid}
    ${roomSurfaceClosed ? `<polygon points="${points}" fill="#ffffff" stroke="none"/>` : ''}
    ${objectRoomSurfaces}
    ${wallMarkup}
    ${wallJoinsMarkup}
    ${project.objects.map((object) => objectMarkup(object, options)).join('')}
  </svg>`;
}

export async function exportProjectPng(
  project: LayoutProject,
  options: ExportOptions,
): Promise<void> {
  const svg = projectToSvg(project, options);
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('PNG 변환용 이미지를 생성하지 못했습니다.'));
      image.src = svgUrl;
    });
    canvas.width = Math.min(4096, Math.max(1200, image.naturalWidth * 2));
    canvas.height = Math.round(canvas.width * (image.naturalHeight / image.naturalWidth));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG 캔버스를 초기화하지 못했습니다.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('PNG 파일을 만들지 못했습니다.'));
    }, 'image/png');
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${project.projectName.replace(/[^a-zA-Z0-9가-힣-_]/g, '-')}.png`;
  document.body.append(anchor);
  anchor.click();
  window.setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 1000);
}
