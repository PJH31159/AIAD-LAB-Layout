import { DialogHeader, ModalFrame } from './ModalFrame';

export function HelpDialog({ open, onboarding = false, onClose }: { open: boolean; onboarding?: boolean; onClose: () => void }) {
  return <ModalFrame open={open} onClose={onClose} labelledBy="help-title" className="app-dialog help-dialog">
    <DialogHeader titleId="help-title" title={onboarding ? 'LabLayout 시작하기' : '도움말과 범례'} description="도면 편집 도구와 색상 기호를 확인합니다." onClose={onClose} autofocusClose />
    <div className="dialog-body help-dialog__body">
      <section><h3>기본 조작</h3><ul><li><kbd>V</kbd> 선택·영역 선택, <kbd>H</kbd> 화면 이동, <kbd>M</kbd> 거리 측정입니다.</li><li><kbd>N</kbd> 꼭짓점 도구에서 외곽벽을 더블 클릭하면 꼭짓점을 추가합니다.</li><li><kbd>W</kbd> 벽 편집, <kbd>Space</kbd> 누른 채 드래그로 화면을 이동합니다.</li><li><kbd>Shift</kbd> 클릭은 다중 선택, <kbd>Esc</kbd>는 진행 작업을 취소합니다.</li></ul></section>
      <section><h3>범례</h3><div className="help-legend"><span><i className="legend-wall" />일반 벽</span><span><i className="legend-glass" />유리벽</span><span><i className="legend-space" />공간 영역</span><span><i className="legend-warning" />배치 경고</span></div></section>
      <section><h3>저장과 복구</h3><p>편집 내용은 브라우저에 자동 저장됩니다. 공용 프로젝트가 연결된 경우 서버 저장 상태가 하단에 별도로 표시됩니다.</p></section>
      <p className="dialog-footnote">단축키는 입력 필드를 편집할 때 작동하지 않습니다.</p>
    </div>
  </ModalFrame>;
}
