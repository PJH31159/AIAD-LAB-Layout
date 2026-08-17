import { describe, expect, it } from 'vitest';
import { createBlankProject } from '../store/layoutStore';
import { analyzeProject } from './analysis';
import { buildAnalysisPdf, buildRasterImagePdf } from './exportPdf';

describe('PDF 분석 보고서', () => {
  it('도면 벡터와 분석 지표가 포함된 PDF를 생성합니다.', () => {
    const project = createBlankProject(5000, 4000);
    project.projectName = 'PDF test';
    const pdf = buildAnalysisPdf(project, analyzeProject(project));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('Total area: 20.0 m2');
    expect(pdf).toContain(' h S');
    expect(pdf).toContain('startxref');
  });

  it('한글 캔버스 이미지를 담는 PDF 바이너리 구조를 생성합니다.', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = buildRasterImagePdf(jpeg, 1240, 1754);
    const text = new TextDecoder().decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Subtype /Image /Width 1240 /Height 1754');
    expect(text).toContain('/Length 4');
    expect(text).toContain('startxref');
  });
});
