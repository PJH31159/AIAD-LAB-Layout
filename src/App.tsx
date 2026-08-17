import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorStatusBar } from './components/layout-editor/EditorStatusBar';
import { EditorToolbar } from './components/layout-editor/EditorToolbar';
import { ExportDialog } from './components/layout-editor/ExportDialog';
import {
  LayoutCanvas,
  type LayoutCanvasHandle,
} from './components/layout-editor/LayoutCanvas';
import { ObjectLibrary } from './components/layout-editor/ObjectLibrary';
import { PropertiesPanel } from './components/layout-editor/PropertiesPanel';
import { ProjectDialog } from './components/layout-editor/ProjectDialog';
import { Toast } from './components/layout-editor/Toast';
import { WarningsDialog } from './components/layout-editor/WarningsDialog';
import { AnalysisDialog } from './components/layout-editor/AnalysisDialog';
import { HelpDialog } from './components/layout-editor/HelpDialog';
import { ConflictDialog } from './components/layout-editor/ConflictDialog';
import { Icon } from './components/icons/Icon';
import { WALL_SNAP_STEP } from './data/layoutConstants';
import { useLayoutStore } from './store/layoutStore';
import type { ExportOptions, LayoutObject, LayoutProject } from './types/layout';
import { getProjectLayoutWarnings } from './utils/collision';
import { exportProjectPng } from './utils/exportPng';
import { shortcutLetter, toolFromShortcut } from './utils/keyboard';
import {
  downloadText,
  parseProject,
  saveProjectSnapshot,
  saveStoredProject,
  serializeProject,
} from './utils/serialization';
import { clearPendingSharedProjectSync, createSharedProject, getActiveSharedProject, getSharedProject, hasPendingSharedProjectSync, setActiveSharedProject, syncActiveSharedProject } from './services/supabaseProjects';

const isEditingField = () => {
  const activeElement = document.activeElement;
  return activeElement instanceof Element
    && activeElement.matches('input, select, textarea, [contenteditable="true"], [role="textbox"]');
};
const ThreeDView = lazy(() => import('./components/layout-editor/ThreeDView'));
const projectFingerprint = (project: LayoutProject) => JSON.stringify({ ...project, updatedAt: '' });

export default function App() {
  const canvasRef = useRef<LayoutCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(() => localStorage.getItem('aiad-layout-onboarding-seen') !== '1');
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [compactWorkspace, setCompactWorkspace] = useState(() => window.matchMedia('(max-width: 1100px)').matches);
  const project = useLayoutStore((state) => state.project);
  const savedProjectFingerprintRef = useRef(projectFingerprint(project));
  const selectedId = useLayoutStore((state) => state.selectedId);
  const selectedIds = useLayoutStore((state) => state.selectedIds);
  const selectedRoomWallIndex = useLayoutStore((state) => state.selectedRoomWallIndex);
  const selectedSpaceId = useLayoutStore((state) => state.selectedSpaceId);
  const leftCollapsed = useLayoutStore((state) => state.leftCollapsed);
  const rightCollapsed = useLayoutStore((state) => state.rightCollapsed);
  const setProject = useLayoutStore((state) => state.setProject);
  const updateObject = useLayoutStore((state) => state.updateObject);
  const beginHistory = useLayoutStore((state) => state.beginHistory);
  const commitHistory = useLayoutStore((state) => state.commitHistory);
  const deleteSelected = useLayoutStore((state) => state.deleteSelected);
  const deleteSelectedRoomWall = useLayoutStore((state) => state.deleteSelectedRoomWall);
  const duplicateSelected = useLayoutStore((state) => state.duplicateSelected);
  const copySelected = useLayoutStore((state) => state.copySelected);
  const pasteObject = useLayoutStore((state) => state.pasteObject);
  const toggleSelectedLock = useLayoutStore((state) => state.toggleSelectedLock);
  const toggleSelectedRoomWallLock = useLayoutStore((state) => state.toggleSelectedRoomWallLock);
  const selectObject = useLayoutStore((state) => state.selectObject);
  const selectAll = useLayoutStore((state) => state.selectAll);
  const groupSelected = useLayoutStore((state) => state.groupSelected);
  const ungroupSelected = useLayoutStore((state) => state.ungroupSelected);
  const setActiveTool = useLayoutStore((state) => state.setActiveTool);
  const rotateProject = useLayoutStore((state) => state.rotateProject);
  const resetFurniture = useLayoutStore((state) => state.resetFurniture);
  const resetAll = useLayoutStore((state) => state.resetAll);
  const undo = useLayoutStore((state) => state.undo);
  const redo = useLayoutStore((state) => state.redo);
  const showToast = useLayoutStore((state) => state.showToast);
  const markSaved = useLayoutStore((state) => state.markSaved);
  const setSaveStatus = useLayoutStore((state) => state.setSaveStatus);
  const setPanels = useLayoutStore((state) => state.setPanels);
  const togglePanel = useLayoutStore((state) => state.togglePanel);
  const warnings = useMemo(() => getProjectLayoutWarnings(project), [project]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1100px)');
    const sync = () => setCompactWorkspace(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (compactWorkspace) {
      setPanels(selectedId || selectedSpaceId || selectedRoomWallIndex !== null
        ? { leftCollapsed: true, rightCollapsed: false }
        : { leftCollapsed: false, rightCollapsed: true });
    }
  }, [compactWorkspace, selectedId, selectedRoomWallIndex, selectedSpaceId, setPanels]);

  useEffect(() => {
    if (!compactWorkspace) setPanels({ leftCollapsed: false, rightCollapsed: false });
  }, [compactWorkspace, setPanels]);

  const toggleWorkspacePanel = useCallback((side: 'left' | 'right') => {
    if (!compactWorkspace) {
      togglePanel(side);
      return;
    }
    if (side === 'left') {
      setPanels(leftCollapsed
        ? { leftCollapsed: false, rightCollapsed: true }
        : { leftCollapsed: true });
      return;
    }
    setPanels(rightCollapsed
      ? { leftCollapsed: true, rightCollapsed: false }
      : { rightCollapsed: true });
  }, [compactWorkspace, leftCollapsed, rightCollapsed, setPanels, togglePanel]);

  const save = useCallback(() => {
    setSaveStatus('saving');
    try {
      const savedAt = saveStoredProject(project);
      savedProjectFingerprintRef.current = projectFingerprint(project);
      markSaved(savedAt);
      const active = getActiveSharedProject();
      if (!active) { showToast('프로젝트를 로컬에 저장했습니다.'); return; }
      setSaveStatus('server-saving');
      void syncActiveSharedProject(project).then((status) => {
        setSaveStatus(status === 'server-saved' ? 'server-saved' : 'local');
        if (status === 'server-saved') showToast('로컬과 공용 서버에 저장했습니다.');
      }).catch((error) => {
        const message = error instanceof Error ? error.message : '';
        if (message === 'LAYOUT_VERSION_CONFLICT') { setSaveStatus('conflict'); setConflictOpen(true); }
        else if (message === 'OFFLINE' || !navigator.onLine) setSaveStatus('offline');
        else setSaveStatus('failed');
        showToast(message === 'LAYOUT_VERSION_CONFLICT' ? '다른 사용자의 변경과 충돌했습니다. 공용 목록에서 최신본을 열거나 복사본으로 저장해 주세요.' : '서버 저장에 실패했지만 로컬 초안은 보존했습니다.');
      });
    } catch {
      setSaveStatus('failed');
      showToast('브라우저 저장 공간이 부족합니다. JSON으로 백업해 주세요.');
    }
  }, [markSaved, project, setSaveStatus, showToast]);

  useEffect(() => {
    const intervalSeconds = project.settings.autoSaveInterval ?? 3;
    const pendingServerSync = hasPendingSharedProjectSync();
    if (projectFingerprint(project) === savedProjectFingerprintRef.current && !pendingServerSync) return;
    if (intervalSeconds === 0 && !pendingServerSync) {
      setSaveStatus('local');
      return;
    }
    setSaveStatus('saving');
    const timer = window.setTimeout(() => {
      if (!pendingServerSync && projectFingerprint(project) === savedProjectFingerprintRef.current) return;
      save();
    }, pendingServerSync ? 0 : intervalSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [project, save, setSaveStatus]);

  useEffect(() => {
    const retry = () => { if (getActiveSharedProject()) save(); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [save]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      const letter = shortcutLetter(event);
      if (document.querySelector('dialog[open]')) {
        if (command && letter === 's') event.preventDefault();
        return;
      }
      if (command && letter === 's') {
        event.preventDefault();
        save();
        return;
      }
      if (command && letter === 'a' && !isEditingField()) {
        event.preventDefault();
        selectAll();
        return;
      }
      if (isEditingField()) return;
      const tool = !command && !event.altKey ? toolFromShortcut(event) : null;
      if (tool) {
        setActiveTool(tool);
        return;
      }
      if (command && letter === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (command && letter === 'y') {
        event.preventDefault();
        redo();
      } else if (command && letter === 'd') {
        event.preventDefault();
        duplicateSelected();
      } else if (command && letter === 'g') {
        event.preventDefault();
        if (event.shiftKey) ungroupSelected();
        else groupSelected();
      } else if (command && letter === 'c') {
        event.preventDefault();
        copySelected();
      } else if (command && letter === 'v') {
        event.preventDefault();
        pasteObject();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        if (selectedRoomWallIndex !== null) deleteSelectedRoomWall();
        else deleteSelected();
      } else if (event.key === 'Escape') {
        if (event.defaultPrevented) return;
        selectObject(null);
        setActiveTool('select');
      } else if (!event.altKey && letter === 'l') {
        if (selectedRoomWallIndex !== null) toggleSelectedRoomWallLock();
        else toggleSelectedLock();
      } else if (selectedId && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const object = project.objects.find((item) => item.id === selectedId);
        if (!object || object.locked) return;
        const amount = object.type === 'wall'
          ? event.shiftKey ? WALL_SNAP_STEP * 10 : WALL_SNAP_STEP
          : event.shiftKey ? project.settings.gridSize * 5 : project.settings.gridSize;
        const changes: Partial<LayoutObject> = {};
        if (event.key === 'ArrowLeft') changes.x = object.x - amount;
        if (event.key === 'ArrowRight') changes.x = object.x + amount;
        if (event.key === 'ArrowUp') changes.y = object.y - amount;
        if (event.key === 'ArrowDown') changes.y = object.y + amount;
        const deltaX = (changes.x ?? object.x) - object.x;
        const deltaY = (changes.y ?? object.y) - object.y;
        const movable = project.objects.filter((item) => selectedIds.includes(item.id) && !item.locked);
        if (!movable.length) return;
        beginHistory();
        movable.forEach((item) => updateObject(item.id, { x: item.x + deltaX, y: item.y + deltaY }, false, item.id === selectedId));
        commitHistory();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    deleteSelected,
    deleteSelectedRoomWall,
    copySelected,
    beginHistory,
    commitHistory,
    duplicateSelected,
    pasteObject,
    project,
    redo,
    groupSelected,
    selectObject,
    selectAll,
    selectedId,
    selectedIds,
    selectedRoomWallIndex,
    toggleSelectedLock,
    toggleSelectedRoomWallLock,
    undo,
    ungroupSelected,
    updateObject,
    save,
    setActiveTool,
  ]);

  const exportJson = () => {
    const safeName = project.projectName.replace(/[^a-zA-Z0-9가-힣-_]/g, '-');
    downloadText(serializeProject(project), `${safeName}.json`, 'application/json');
    showToast('JSON 파일을 내보냈습니다.');
  };

  const importJson = async (file: File) => {
    try {
      const imported = parseProject(await file.text());
      setActiveSharedProject(null);
      replaceProject(imported, '프로젝트를 불러왔습니다.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '파일을 불러오지 못했습니다.');
    }
  };

  const exportPng = async (options: ExportOptions) => {
    try {
      await exportProjectPng(project, options);
      showToast('PNG 파일을 내보냈습니다.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'PNG 내보내기에 실패했습니다.');
      throw error;
    }
  };

  const replaceProject = (nextProject: LayoutProject, message: string) => {
    try {
      const savedAt = saveStoredProject(nextProject);
      savedProjectFingerprintRef.current = projectFingerprint(nextProject);
      markSaved(savedAt);
    } catch {
      showToast('프로젝트를 열었지만 브라우저 저장 공간에 기록하지 못했습니다. JSON으로 백업해 주세요.');
    }
    setProject(nextProject, message);
    window.setTimeout(() => canvasRef.current?.fitView(), 0);
  };

  const openLatestConflictVersion = async () => {
    const active = getActiveSharedProject();
    if (!active) return setConflictOpen(false);
    setConflictBusy(true);
    try {
      saveProjectSnapshot(project);
      const record = await getSharedProject(active.id);
      setActiveSharedProject({ id: record.id, name: record.name, author_name: record.author_name, description: record.description, version: record.version });
      clearPendingSharedProjectSync();
      replaceProject({ ...record.layout_data, projectName: record.name }, '서버 최신본을 열었습니다. 기존 편집본은 별도 로컬 버전으로 보관했습니다.');
      setSaveStatus('server-saved'); setConflictOpen(false);
    } catch { showToast('서버 최신본을 열지 못했습니다.'); }
    finally { setConflictBusy(false); }
  };

  const saveConflictCopy = async () => {
    const active = getActiveSharedProject();
    if (!active) return setConflictOpen(false);
    setConflictBusy(true);
    try {
      const name = `${project.projectName} - ${localStorage.getItem('aiad-user-name') || active.author_name} 복사본`;
      const saved = await createSharedProject({ name, author_name: localStorage.getItem('aiad-user-name') || active.author_name, description: active.description, layout_data: { ...project, projectName: name } });
      setActiveSharedProject({ id: saved.id, name: saved.name, author_name: saved.author_name, description: saved.description, version: saved.version });
      replaceProject({ ...project, projectName: name }, '현재 편집본을 새 공용 복사본으로 저장했습니다.');
      setSaveStatus('server-saved'); setConflictOpen(false);
    } catch { showToast('공용 복사본 저장에 실패했습니다.'); }
    finally { setConflictBusy(false); }
  };

  return (
    <div className="app-shell">
      <EditorToolbar
        onSave={save}
        onImport={() => fileInputRef.current?.click()}
        onExportJson={exportJson}
        onExportPng={() => setExportOpen(true)}
        onNew={() => setProjectsOpen(true)}
        viewMode={viewMode}
        onViewMode={setViewMode}
        onAnalysis={() => setAnalysisOpen(true)}
        onHelp={() => setHelpOpen(true)}
        onRotate={(degrees) => { rotateProject(degrees); window.setTimeout(() => canvasRef.current?.fitView(), 0); }}
      />
      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importJson(file);
          event.target.value = '';
        }}
      />
      {viewMode === '3d' ? <main className="editor-workspace editor-workspace--3d"><Suspense fallback={<div className="three-d-loading" role="status"><span className="content-loader" aria-hidden="true" />3D 보기를 불러오는 중입니다…</div>}><ThreeDView onReturn2D={() => setViewMode('2d')} /></Suspense></main> : <main className={`editor-workspace ${leftCollapsed ? 'is-left-collapsed' : ''} ${rightCollapsed ? 'is-right-collapsed' : ''}`}>
        {!leftCollapsed && <ObjectLibrary />}
        <button
          className={`panel-toggle-rail panel-toggle-rail--left ${leftCollapsed ? 'is-collapsed' : ''}`}
          type="button"
          onClick={() => toggleWorkspacePanel('left')}
          onPointerUp={(event) => event.currentTarget.blur()}
          title={leftCollapsed ? '객체 라이브러리 열기' : '객체 라이브러리 접기'}
          aria-label={leftCollapsed ? '객체 라이브러리 열기' : '객체 라이브러리 접기'}
          aria-controls="object-library-panel"
          aria-expanded={!leftCollapsed}
        ><Icon name={leftCollapsed ? 'chevron-right' : 'chevron-left'} size={12} /></button>
        <LayoutCanvas ref={canvasRef} warnings={warnings} onOpenWarnings={() => setWarningsOpen(true)} />
        {!rightCollapsed && <PropertiesPanel warnings={warnings} />}
        <button
          className={`panel-toggle-rail panel-toggle-rail--right ${rightCollapsed ? 'is-collapsed' : ''}`}
          type="button"
          onClick={() => toggleWorkspacePanel('right')}
          onPointerUp={(event) => event.currentTarget.blur()}
          title={rightCollapsed ? '속성 패널 열기' : '속성 패널 접기'}
          aria-label={rightCollapsed ? '속성 패널 열기' : '속성 패널 접기'}
          aria-controls="properties-panel"
          aria-expanded={!rightCollapsed}
        ><Icon name={rightCollapsed ? 'chevron-left' : 'chevron-right'} size={12} /></button>
      </main>}
      {viewMode === '2d' && <EditorStatusBar onFit={() => canvasRef.current?.fitView()} onFocusSelected={() => { if (selectedId) canvasRef.current?.focusObject(selectedId); }} hasSelection={Boolean(selectedId)} onRetry={save} />}
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} onExport={exportPng} />
      {projectsOpen && <ProjectDialog open currentProject={project} onClose={() => setProjectsOpen(false)} onMessage={(message) => showToast(message)} onOpenProject={(savedProject) => replaceProject(savedProject, '보관된 배치안을 열었습니다.')} onResetFurniture={resetFurniture} onResetAll={() => { resetAll(); window.setTimeout(() => canvasRef.current?.fitView(), 0); }} />}
      {warningsOpen && <WarningsDialog open warnings={warnings} objects={project.objects} onClose={() => setWarningsOpen(false)} onSelect={(id) => { selectObject(id); canvasRef.current?.focusObject(id); setWarningsOpen(false); }} />}
      {analysisOpen && <AnalysisDialog open project={project} warningCount={warnings.length} onClose={() => setAnalysisOpen(false)} />}
      {helpOpen && <HelpDialog open onboarding={localStorage.getItem('aiad-layout-onboarding-seen') !== '1'} onClose={() => { localStorage.setItem('aiad-layout-onboarding-seen', '1'); setHelpOpen(false); }} />}
      {conflictOpen && <ConflictDialog open busy={conflictBusy} onClose={() => setConflictOpen(false)} onLatest={() => void openLatestConflictVersion()} onCopy={() => void saveConflictCopy()} />}
      <Toast />
    </div>
  );
}
