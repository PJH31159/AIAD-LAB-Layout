import type { LayoutProject } from '../types/layout';
import type { LayoutAnalysis } from './analysis';
import { roomBounds } from './coordinates';
import { getProjectLayoutWarnings } from './collision';
import { getRoomWallOuterSegments, isRoomBoundaryClosed } from './roomGeometry';
import { getWallEndpoints } from './structurePlacement';
import { getClosedWallLoops, getObjectWallFaceGeometry, getRoomWallFaceGeometries, getWallJoinPolygons } from './wallGeometry';

const escape = (value: string) => value.replace(/[^\x20-\x7E]/g, '?').replace(/[()\\]/g, '\\$&');

export function buildAnalysisPdf(project: LayoutProject, analysis: LayoutAnalysis) {
  const bounds = roomBounds(project.room.vertices);
  const scale = Math.min(480 / Math.max(1, bounds.width), 330 / Math.max(1, bounds.height));
  const map = (x: number, y: number) => ({ x: 60 + (x - bounds.left) * scale, y: 420 - (y - bounds.top) * scale });
  const room = project.room.vertices.map((point, index) => { const mapped = map(point.x, point.y); return `${mapped.x.toFixed(2)} ${mapped.y.toFixed(2)} ${index ? 'l' : 'm'}`; }).join(' ');
  const objects = project.objects.map((object) => { const p = map(object.x, object.y + object.depth); return `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${(object.width * scale).toFixed(2)} ${(object.depth * scale).toFixed(2)} re S`; }).join('\n');
  const lines = [
    `AIAD Lab Layout Analysis - ${escape(project.projectName)}`,
    `Total area: ${analysis.totalAreaM2.toFixed(1)} m2`, `Occupied area: ${analysis.occupiedAreaM2.toFixed(1)} m2`,
    `Occupancy: ${analysis.occupancyRate.toFixed(1)}%`, `Seats: ${analysis.seats}`,
    `Minimum aisle: ${analysis.minimumAisleMm === null ? 'N/A' : `${Math.round(analysis.minimumAisleMm)} mm`}`,
    `Warnings: ${analysis.warningCount}`, `Meeting spaces: ${analysis.meetingSpaces}`,
    `Fridge access: ${analysis.fridgeAccessible === null ? 'N/A' : analysis.fridgeAccessible ? 'Clear' : 'Blocked'}`,
    `Monitor sight: ${analysis.monitorSightClear === null ? 'N/A' : analysis.monitorSightClear ? 'Clear' : 'Blocked'}`,
  ];
  const text = lines.map((line, index) => `BT /F1 ${index ? 10 : 16} Tf 60 ${760 - index * 20} Td (${line}) Tj ET`).join('\n');
  const stream = `${text}\n0.2 0.51 0.96 RG 1.2 w ${room} h S\n0.55 0.6 0.67 RG .5 w\n${objects}`;
  const objectsPdf = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objectsPdf.forEach((object, index) => { offsets.push(new TextEncoder().encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objectsPdf.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer << /Size ${objectsPdf.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

export function buildRasterImagePdf(jpeg: Uint8Array, width: number, height: number) {
  return buildRasterImagesPdf([{ jpeg, width, height }]);
}

export function buildRasterImagesPdf(images: { jpeg: Uint8Array; width: number; height: number }[]) {
  const encoder = new TextEncoder(); const chunks: Uint8Array[] = []; const offsets = [0]; let byteLength = 0;
  const append = (value: string | Uint8Array) => { const bytes = typeof value === 'string' ? encoder.encode(value) : value; chunks.push(bytes); byteLength += bytes.byteLength; };
  const object = (id: number, body: string | Uint8Array) => { offsets[id] = byteLength; append(`${id} 0 obj\n`); append(body); append('\nendobj\n'); };
  const count = images.length;
  const contentBase = 3 + count;
  const imageBase = contentBase + count;
  append('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${images.map((_, index) => `${3 + index} 0 R`).join(' ')}] /Count ${count} >>`);
  images.forEach((_, index) => object(3 + index, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 ${imageBase + index} 0 R >> >> /Contents ${contentBase + index} 0 R >>`));
  images.forEach((_, index) => { const content = 'q 595 0 0 842 0 0 cm /Im1 Do Q'; object(contentBase + index, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`); });
  images.forEach(({ jpeg, width, height }, index) => { const id = imageBase + index; offsets[id] = byteLength; append(`${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`); append(jpeg); append('\nendstream\nendobj\n'); });
  const objectCount = imageBase + count - 1;
  const xref = byteLength; append(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n${Array.from({ length: objectCount }, (_, index) => `${String(offsets[index + 1]).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer << /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const output = new Uint8Array(byteLength); let position = 0; chunks.forEach((chunk) => { output.set(chunk, position); position += chunk.byteLength; }); return output;
}

export async function exportAnalysisPdf(project: LayoutProject, analysis: LayoutAnalysis) {
  await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1754;
  const context = canvas.getContext('2d'); if (!context) throw new Error('PDF_CANVAS_UNAVAILABLE');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#111827'; context.font = '700 34px Pretendard, sans-serif'; context.fillText('AIAD 연구실 배치 분석 보고서', 70, 80);
  context.fillStyle = '#64748b'; context.font = '18px Pretendard, sans-serif'; context.fillText(`${project.projectName} · ${new Date().toLocaleDateString('ko-KR')} · ${project.orientation.label}`, 70, 116);
  const metrics = [
    `전체 면적  ${analysis.totalAreaM2.toFixed(1)} m²`, `점유 면적  ${analysis.occupiedAreaM2.toFixed(1)} m²`, `잔여 면적  ${analysis.remainingAreaM2.toFixed(1)} m²`, `점유율  ${analysis.occupancyRate.toFixed(1)}%`,
    `책상 ${analysis.desks}개 · 의자 ${analysis.chairs}개`, `전체 좌석 ${analysis.seats}석 · 회의 좌석 ${analysis.meetingSeats}석`, `최소 통로 폭  ${analysis.minimumAisleMm === null ? '—' : `${Math.round(analysis.minimumAisleMm)} mm`}`, `모니터–회의 테이블  ${analysis.monitorTableDistanceMm === null ? '미배치' : `${Math.round(analysis.monitorTableDistanceMm)} mm`}`,
    `출입구 접근  ${analysis.entranceAccessible === null ? '출입문 없음' : analysis.entranceAccessible ? '확보' : '차단'}`, `냉장고 접근  ${analysis.fridgeAccessible === null ? '미배치' : analysis.fridgeAccessible ? '확보' : '차단'}`, `모니터 시야  ${analysis.monitorSightClear === null ? '미배치' : analysis.monitorSightClear ? '확보' : '차단'}`, `경고  ${analysis.warningCount}건`,
  ];
  context.font = '600 20px Pretendard, sans-serif';
  metrics.forEach((line, index) => { const column = index % 3; const row = Math.floor(index / 3); context.fillStyle = '#f6f7f9'; context.fillRect(70 + column * 370, 150 + row * 82, 345, 60); context.fillStyle = '#334155'; context.fillText(line, 88 + column * 370, 188 + row * 82); });
  const bounds = roomBounds(project.room.vertices); const diagram = { x: 70, y: 520, width: 1100, height: 560 };
  const scale = Math.min(diagram.width / Math.max(1, bounds.width), diagram.height / Math.max(1, bounds.height));
  const map = (point: { x: number; y: number }) => ({ x: diagram.x + (diagram.width - bounds.width * scale) / 2 + (point.x - bounds.left) * scale, y: diagram.y + (diagram.height - bounds.height * scale) / 2 + (point.y - bounds.top) * scale });
  const drawPolygon = (points: { x: number; y: number }[], fill: string) => { context.fillStyle = fill; context.beginPath(); points.forEach((point, index) => { const mapped = map(point); if (index) context.lineTo(mapped.x, mapped.y); else context.moveTo(mapped.x, mapped.y); }); context.closePath(); context.fill(); };
  const roomSurfaceClosed = isRoomBoundaryClosed(
    project.room.vertices,
    project.room.removedWallIndices ?? [],
    project.objects.filter((object) => object.type === 'wall').map((wall) => ({ ...getWallEndpoints(wall), thickness: wall.depth })),
  );
  if (roomSurfaceClosed) drawPolygon(project.room.vertices, '#ffffff');
  getClosedWallLoops(project.objects).forEach((polygon) => drawPolygon(polygon, '#ffffff'));
  getRoomWallOuterSegments(project.room.vertices, project.room.removedWallIndices ?? [], project.room.wallThicknesses ?? 100).forEach((segment) => { if (segment) drawPolygon([segment.inStart, segment.inEnd, segment.outEnd, segment.outStart], '#334155'); });
  getWallJoinPolygons([
    ...getRoomWallFaceGeometries(project.room.vertices, project.room.removedWallIndices ?? [], project.room.wallThicknesses ?? 100),
    ...project.objects.flatMap((object) => { const wall = getObjectWallFaceGeometry(object); return wall ? [wall] : []; }),
  ]).forEach((polygon) => drawPolygon(polygon, '#334155'));
  project.objects.forEach((object) => { const center = map({ x: object.x + object.width / 2, y: object.y + object.depth / 2 }); context.save(); context.translate(center.x, center.y); context.rotate(object.rotation * Math.PI / 180); context.globalAlpha = object.opacity ?? 1; context.fillStyle = object.color ?? (object.type === 'glass-wall' ? '#93c5fd' : object.type === 'wall' ? '#334155' : '#94a3b8'); context.fillRect(-object.width * scale / 2, -object.depth * scale / 2, object.width * scale, object.depth * scale); context.restore(); });
  context.globalAlpha = 1; context.fillStyle = '#475569'; context.font = '18px Pretendard, sans-serif'; context.fillText('통로 폭과 접근성은 회전 기하 기반 근사 검토값입니다.', 70, 1160);
  const furniture = project.objects.filter((object) => !['wall', 'glass-wall', 'door', 'window', 'column', 'outlet', 'lan-port', 'distribution', 'ac'].includes(object.type));
  const warnings = getProjectLayoutWarnings(project);
  const spaceName = (id: string | undefined) => project.room.spaces?.find((space) => space.id === id)?.name ?? '미지정';
  const detailLines = [
    { heading: true, text: `전체 가구 목록 ${furniture.length}개` },
    ...furniture.map((object, index) => ({ heading: false, text: `${index + 1}. ${object.name} · ${Math.round(object.width)}×${Math.round(object.depth)} mm · 공간 ${spaceName(object.spaceId)} · (${Math.round(object.x)}, ${Math.round(object.y)})` })),
    { heading: true, text: `전체 경고 ${warnings.length}건` },
    ...(warnings.length ? warnings.map((warning, index) => ({ heading: false, text: `${index + 1}. ${warning.message}` })) : [{ heading: false, text: '경고가 없습니다.' }]),
  ];
  const detailPages: HTMLCanvasElement[] = [];
  for (let offset = 0; offset < detailLines.length; offset += 38) {
    const page = document.createElement('canvas'); page.width = 1240; page.height = 1754;
    const pageContext = page.getContext('2d'); if (!pageContext) throw new Error('PDF_CANVAS_UNAVAILABLE');
    pageContext.fillStyle = '#ffffff'; pageContext.fillRect(0, 0, page.width, page.height);
    pageContext.fillStyle = '#111827'; pageContext.font = '700 32px Pretendard, sans-serif'; pageContext.fillText('AIAD 연구실 배치 분석 상세', 70, 80);
    pageContext.fillStyle = '#64748b'; pageContext.font = '18px Pretendard, sans-serif'; pageContext.fillText(`${project.projectName} · ${project.orientation.label} · ${Math.floor(offset / 38) + 2}쪽`, 70, 116);
    detailLines.slice(offset, offset + 38).forEach((line, index) => { pageContext.fillStyle = line.heading ? '#111827' : '#475569'; pageContext.font = line.heading ? '700 23px Pretendard, sans-serif' : '17px Pretendard, sans-serif'; pageContext.fillText(line.text.slice(0, 115), 70, 175 + index * 39); });
    detailPages.push(page);
  }
  const toJpeg = async (page: HTMLCanvasElement) => { const blob = await new Promise<Blob>((resolve, reject) => page.toBlob((value) => value ? resolve(value) : reject(new Error('PDF_IMAGE_FAILED')), 'image/jpeg', .92)); return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: page.width, height: page.height }; };
  const images = await Promise.all([canvas, ...detailPages].map(toJpeg));
  const pdf = buildRasterImagesPdf(images);
  const href = URL.createObjectURL(new Blob([pdf.buffer as ArrayBuffer], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = href;
  link.download = `${project.projectName.replace(/[^a-zA-Z0-9가-힣-_]/g, '-')}-analysis.pdf`;
  document.body.append(link);
  link.click();
  window.setTimeout(() => { link.remove(); URL.revokeObjectURL(href); }, 1000);
}
