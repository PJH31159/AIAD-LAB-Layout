import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Icon } from '../icons/Icon';
import { useLayoutStore } from '../../store/layoutStore';

type EditorToolbarProps = {
  onSave: () => void;
  onImport: () => void;
  onExportJson: () => void;
  onExportPng: () => void;
  onNew: () => void;
  viewMode: '2d' | '3d';
  onViewMode: (mode: '2d' | '3d') => void;
  onAnalysis: () => void;
  onHelp: () => void;
  onRotate: (degrees: -90 | 90) => void;
};

export function EditorToolbar({
  onSave,
  onImport,
  onExportJson,
  onExportPng,
  onNew,
  viewMode,
  onViewMode,
  onAnalysis,
  onHelp,
  onRotate,
}: EditorToolbarProps) {
  const undo = useLayoutStore((state) => state.undo);
  const redo = useLayoutStore((state) => state.redo);
  const canUndo = useLayoutStore((state) => state.past.length > 0);
  const canRedo = useLayoutStore((state) => state.future.length > 0);
  const projectName = useLayoutStore((state) => state.project.projectName);
  const fileMenuRef = useRef<HTMLDetailsElement>(null);
  const drawingMenuRef = useRef<HTMLDetailsElement>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [drawingMenuOpen, setDrawingMenuOpen] = useState(false);
  useEffect(() => {
    if (!fileMenuOpen && !drawingMenuOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!fileMenuRef.current?.contains(event.target as Node)) setFileMenuOpen(false);
      if (!drawingMenuRef.current?.contains(event.target as Node)) setDrawingMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        const target = fileMenuOpen ? fileMenuRef.current : drawingMenuRef.current;
        setFileMenuOpen(false);
        setDrawingMenuOpen(false);
        target?.querySelector<HTMLElement>('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [drawingMenuOpen, fileMenuOpen]);
  const runFileAction = (action: () => void) => {
    fileMenuRef.current?.removeAttribute('open');
    setFileMenuOpen(false);
    action();
  };
  const runDrawingAction = (action: () => void) => {
    drawingMenuRef.current?.removeAttribute('open');
    setDrawingMenuOpen(false);
    action();
  };
  const viewModes = ['2d', '3d'] as const;
  const moveViewFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, current: typeof viewMode) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = viewModes.indexOf(current);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? viewModes.length - 1 : (currentIndex + (event.key === 'ArrowLeft' ? -1 : 1) + viewModes.length) % viewModes.length;
    const next = viewModes[nextIndex];
    const tabList = event.currentTarget.parentElement;
    onViewMode(next);
    window.requestAnimationFrame(() => tabList?.querySelectorAll<HTMLElement>('[role="tab"]')[nextIndex]?.focus());
  };

  return (
    <header className="editor-toolbar">
      <div className="editor-toolbar__brand">
        <span className="project-title">LabLayout</span>
        <span className="project-subtitle">{projectName}</span>
      </div>
      <nav className="toolbar-actions" aria-label="프로젝트 작업">
        <div className="toolbar-group" aria-label="작업 기록">
          <button className="icon-button has-tooltip" onClick={undo} disabled={!canUndo} data-tooltip="실행 취소 · Ctrl+Z" aria-label="실행 취소"><Icon name="undo" /></button>
          <button className="icon-button has-tooltip" onClick={redo} disabled={!canRedo} data-tooltip="다시 실행 · Ctrl+Shift+Z" aria-label="다시 실행"><Icon name="redo" /></button>
        </div>
        <div className="toolbar-divider" />
        <button onClick={onAnalysis}>분석·비교</button>
        <button onClick={onHelp}>도움말</button>
        <div className="toolbar-divider" />
        <div className="segmented-control toolbar-view-switch" role="tablist" aria-label="보기 모드">{viewModes.map((mode) => <button key={mode} role="tab" tabIndex={viewMode === mode ? 0 : -1} aria-selected={viewMode === mode} className={viewMode === mode ? 'is-active' : ''} onClick={() => onViewMode(mode)} onKeyDown={(event) => moveViewFocus(event, mode)}>{mode.toUpperCase()}</button>)}</div>
        <div className="toolbar-divider" />
        <div className="toolbar-group" aria-label="배치안 설정">
          <button onClick={onNew} title="배치안 관리"><Icon name="plus" /><span>배치안 관리</span></button>
        </div>
        <div className="toolbar-divider" />
        <button className="button-primary toolbar-save" onClick={onSave} title="현재 배치안 저장"><Icon name="save" /><span>저장</span></button>
        <details className="toolbar-menu" ref={fileMenuRef} open={fileMenuOpen} onToggle={(event) => { setFileMenuOpen(event.currentTarget.open); if (event.currentTarget.open) setDrawingMenuOpen(false); }}>
          <summary role="button" title="불러오기 및 내보내기" aria-label="파일 메뉴" aria-expanded={fileMenuOpen}><Icon name="download" /><span>파일</span><Icon name="chevron-down" size={14} /></summary>
          <div className="toolbar-menu__popover" role="menu">
            <button role="menuitem" onClick={() => runFileAction(onImport)}><Icon name="upload" /><span><strong>JSON 불러오기</strong><small>저장된 배치안을 엽니다.</small></span></button>
            <button role="menuitem" onClick={() => runFileAction(onExportJson)}><Icon name="download" /><span><strong>JSON 내보내기</strong><small>편집 가능한 원본을 저장합니다.</small></span></button>
            <button role="menuitem" onClick={() => runFileAction(onExportPng)}><Icon name="image" /><span><strong>PNG 내보내기</strong><small>배치 이미지를 저장합니다.</small></span></button>
          </div>
        </details>
        <details className="toolbar-menu" ref={drawingMenuRef} open={drawingMenuOpen} onToggle={(event) => { setDrawingMenuOpen(event.currentTarget.open); if (event.currentTarget.open) setFileMenuOpen(false); }}>
          <summary role="button" title="도면 방향" aria-label="도면 메뉴" aria-expanded={drawingMenuOpen}><Icon name="grid" /><span>도면</span><Icon name="chevron-down" size={14} /></summary>
          <div className="toolbar-menu__popover" role="menu">
            <button role="menuitem" onClick={() => runDrawingAction(() => onRotate(-90))}><Icon name="undo" /><span><strong>왼쪽 90° 회전</strong><small>도면과 방향 정보를 함께 회전합니다.</small></span></button>
            <button role="menuitem" onClick={() => runDrawingAction(() => onRotate(90))}><Icon name="redo" /><span><strong>오른쪽 90° 회전</strong><small>도면과 방향 정보를 함께 회전합니다.</small></span></button>
          </div>
        </details>
      </nav>
    </header>
  );
}
