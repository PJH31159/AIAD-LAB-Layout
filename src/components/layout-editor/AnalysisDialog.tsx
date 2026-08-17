import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutProject } from '../../types/layout';
import { analyzeProject } from '../../utils/analysis';
import { exportAnalysisPdf } from '../../utils/exportPdf';
import { loadProjectLibrary } from '../../utils/serialization';
import { DialogHeader, ModalFrame } from './ModalFrame';

export function AnalysisDialog({ open, project, warningCount, onClose }: { open: boolean; project: LayoutProject; warningCount: number; onClose: () => void }) {
  const candidates = useMemo(() => [{ id: 'current', project, savedAt: project.updatedAt }, ...loadProjectLibrary()], [project]);
  const [selected, setSelected] = useState<string[]>(['current']);
  const [reportSaved, setReportSaved] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const rows = candidates.filter((entry) => selected.includes(entry.id)).map((entry) => ({ ...entry, analysis: analyzeProject(entry.project, entry.id === 'current' ? warningCount : undefined) }));
  const current = analyzeProject(project, warningCount);
  const exportReport = () => {
    setReportBusy(true);
    setReportSaved(false);
    setReportError(null);
    void exportAnalysisPdf(project, current)
      .then(() => { if (mountedRef.current) setReportSaved(true); })
      .catch((reason) => { if (mountedRef.current) setReportError(reason instanceof Error ? reason.message : 'PDF 보고서를 생성하지 못했습니다.'); })
      .finally(() => { if (mountedRef.current) setReportBusy(false); });
  };

  return <ModalFrame open={open} onClose={onClose} labelledBy="analysis-title" className="app-dialog analysis-dialog">
    <DialogHeader titleId="analysis-title" title="배치 분석 및 비교" description="현재 배치의 공간 지표를 확인하고 보관된 배치안과 비교합니다." onClose={onClose} autofocusClose />
    <div className="dialog-body analysis-dialog__body">
      <p className="analysis-disclaimer">통로 폭과 접근성은 회전 기하를 사용하는 근사 검토값입니다. 실제 피난·접근 경로 판정을 대체하지 않습니다.</p>
      <div className="analysis-overview">
        <section className="analysis-section" aria-labelledby="area-summary-title">
          <header className="analysis-section-header"><div><h3 id="area-summary-title">면적 요약</h3><p>현재 도면 경계 안에서 객체가 차지하는 비율입니다.</p></div><strong>{current.occupancyRate.toFixed(1)}%</strong></header>
          <div className="analysis-progress" role="img" aria-label={`전체 면적 중 점유 면적 비율 ${current.occupancyRate.toFixed(1)}%`}><span style={{ width: `${Math.min(100, Math.max(0, current.occupancyRate))}%` }} /></div>
          <dl className="analysis-table-rows">
            <div><dt>전체 면적</dt><dd>{current.totalAreaM2.toFixed(1)} m²</dd></div>
            <div><dt>점유 면적</dt><dd>{current.occupiedAreaM2.toFixed(1)} m²</dd></div>
            <div><dt>잔여 면적</dt><dd>{current.remainingAreaM2.toFixed(1)} m²</dd></div>
          </dl>
          <div className="analysis-report-row">
            <div><strong>도면 포함 PDF 보고서</strong><p>현재 도면과 분석 지표를 한 파일로 저장합니다.</p></div>
            <button className="button-weak" disabled={reportBusy} aria-busy={reportBusy} onClick={exportReport}>{reportBusy && <span className="button-loader" aria-hidden="true" />}{reportBusy ? '생성 중…' : 'PDF 저장'}</button>
          </div>
          {reportSaved && <p className="report-saved" role="status">PDF 보고서를 생성했습니다.</p>}
          {reportError && <p className="dialog-error" role="alert">{reportError}</p>}
        </section>

        <section className="analysis-section" aria-labelledby="layout-status-title">
          <header className="analysis-section-header"><div><h3 id="layout-status-title">배치 상태</h3><p>수량과 접근성 검토 결과입니다.</p></div></header>
          <dl className="analysis-table-rows analysis-status-rows">
            <div><dt>책상 / 의자</dt><dd>{current.desks} / {current.chairs}</dd></div>
            <div><dt>전체 / 회의 좌석</dt><dd>{current.seats} / {current.meetingSeats}</dd></div>
            <div><dt>회의 공간</dt><dd>{current.meetingSpaces}개</dd></div>
            <div><dt>근사 최소 통로</dt><dd>{current.minimumAisleMm === null ? '—' : `${Math.round(current.minimumAisleMm)} mm`}</dd></div>
            <div><dt>출입구 접근</dt><dd>{current.entranceAccessible === null ? '출입문 없음' : current.entranceAccessible ? '확보' : '차단'}</dd></div>
            <div><dt>냉장고 접근</dt><dd>{current.fridgeAccessible === null ? '미배치' : current.fridgeAccessible ? '확보' : '차단'}</dd></div>
            <div><dt>모니터 시야</dt><dd>{current.monitorSightClear === null ? '미배치' : current.monitorSightClear ? '확보' : '차단'}</dd></div>
            <div><dt>모니터와 테이블</dt><dd>{current.monitorTableDistanceMm === null ? '미배치' : `${Math.round(current.monitorTableDistanceMm)} mm`}</dd></div>
            <div><dt>배치 경고</dt><dd>{current.warningCount}건</dd></div>
          </dl>
        </section>
      </div>

      <section className="comparison-section">
        <header className="analysis-section-header"><div><h3>배치안 비교</h3><p>비교할 보관 배치안을 두 개 이상 선택합니다.</p></div><span>{selected.length}개 선택</span></header>
        <div className="comparison-choices">{candidates.map((entry) => <label key={entry.id}><span>{entry.project.projectName}<small>{entry.project.objects.length}개 객체</small></span><input type="checkbox" checked={selected.includes(entry.id)} onChange={() => setSelected((value) => value.includes(entry.id) ? value.filter((id) => id !== entry.id) : [...value, entry.id])} /></label>)}</div>
        {rows.length >= 2 ? <div className="comparison-table-wrap"><table><thead><tr><th>배치안</th><th>면적</th><th>점유율</th><th>좌석</th><th>통로</th><th>경고</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.project.projectName}</td><td>{row.analysis.totalAreaM2.toFixed(1)} m²</td><td>{row.analysis.occupancyRate.toFixed(1)}%</td><td>{row.analysis.seats}</td><td>{row.analysis.minimumAisleMm === null ? '—' : `${Math.round(row.analysis.minimumAisleMm)} mm`}</td><td>{row.analysis.warningCount}</td></tr>)}</tbody></table></div> : <p className="analysis-empty">보관된 배치안을 하나 더 선택하면 비교표가 표시됩니다.</p>}
      </section>
    </div>
  </ModalFrame>;
}
