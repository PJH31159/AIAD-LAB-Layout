import { DialogHeader, ModalFrame } from './ModalFrame';

export function ConflictDialog({ open, busy, onLatest, onCopy, onClose }: { open: boolean; busy: boolean; onLatest: () => void; onCopy: () => void; onClose: () => void }) {
  return <ModalFrame open={open} onClose={onClose} labelledBy="conflict-title" className="app-dialog conflict-dialog">
    <DialogHeader titleId="conflict-title" title="서버 버전 충돌" description="다른 사용자가 먼저 저장하여 현재 서버 버전이 변경되었습니다." />
    <div className="dialog-body"><p className="dialog-notice">최신 서버본을 열면 현재 편집본은 로컬 초안에 남습니다. 복사본 저장은 현재 편집본을 새 공용 프로젝트로 보존합니다.</p></div>
    <footer className="dialog-footer"><button data-autofocus onClick={onClose} disabled={busy}>취소</button><button onClick={onLatest} disabled={busy}>최신본 열기</button><button className="button-primary" onClick={onCopy} disabled={busy}>{busy && <span className="button-loader" aria-hidden="true" />}{busy ? '처리 중…' : '복사본 저장'}</button></footer>
  </ModalFrame>;
}
