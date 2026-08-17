import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createInitialProject } from '../../store/layoutStore';
import type { LayoutProject } from '../../types/layout';
import {
  deleteProjectSnapshot,
  loadProjectLibrary,
  saveProjectSnapshot,
  saveStoredProject,
  loadProjectMainLegacyDraft,
  type StoredProjectEntry,
} from '../../utils/serialization';
import { Icon } from '../icons/Icon';
import { DialogHeader, ModalFrame } from './ModalFrame';
import {
  archiveSharedProject,
  createSharedProject,
  getSharedProject,
  getSupabaseSession,
  isSupabaseConfigured,
  listSharedProjects,
  renameSharedProject,
  restoreSupabaseSession,
  setActiveSharedProject,
  subscribeSharedProjects,
  signInWithPassword,
  signOutSupabase,
  supabaseDisplayName,
  syncActiveSharedProject,
  type SharedProjectSummary,
  type SupabaseSession,
} from '../../services/supabaseProjects';

export function ProjectDialog({
  open,
  currentProject,
  onClose,
  onOpenProject,
  onMessage,
  onResetFurniture,
  onResetAll,
}: {
  open: boolean;
  currentProject: LayoutProject;
  onClose: () => void;
  onOpenProject: (project: LayoutProject) => void;
  onMessage: (message: string) => void;
  onResetFurniture: () => void;
  onResetAll: () => void;
}) {
  const [entries, setEntries] = useState<StoredProjectEntry[]>(() => loadProjectLibrary());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [shared, setShared] = useState<SharedProjectSummary[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'updated' | 'name' | 'author'>('updated');
  const [userName, setUserName] = useState(() => localStorage.getItem('aiad-user-name') || '');
  const [userDraft, setUserDraft] = useState(() => localStorage.getItem('aiad-user-name') || '');
  const [userEditing, setUserEditing] = useState(false);
  const [session, setSession] = useState<SupabaseSession | null>(() => isSupabaseConfigured ? getSupabaseSession() : null);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [authBusy, setAuthBusy] = useState(false);
  const [sharedCreateBusy, setSharedCreateBusy] = useState(false);
  const [sharedForm, setSharedForm] = useState<{ project: LayoutProject; name: string; author: string; description: string } | null>(null);
  const [renameForm, setRenameForm] = useState<{ entry: SharedProjectSummary; name: string } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<SharedProjectSummary | null>(null);
  const [pendingReset, setPendingReset] = useState<'furniture' | 'official' | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<{ label: string; run: () => Promise<void> } | null>(null);
  const refreshRequestRef = useRef(0);
  const sharedCreateInFlightRef = useRef(false);
  const legacyProject = loadProjectMainLegacyDraft();
  const visibleShared = useMemo(() => shared
    .filter((entry) => !query.trim() || `${entry.name} ${entry.author_name}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ko') : sort === 'author' ? a.author_name.localeCompare(b.author_name, 'ko') : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()), [query, shared, sort]);

  const refreshShared = useCallback(async () => {
    if (!isSupabaseConfigured || !session) return;
    const requestId = ++refreshRequestRef.current;
    setSharedLoading(true);
    try {
      const projects = await listSharedProjects();
      if (refreshRequestRef.current === requestId) setShared(projects);
    } catch {
      if (refreshRequestRef.current === requestId) onMessage('공용 배치안 목록을 불러오지 못했습니다.');
    } finally {
      if (refreshRequestRef.current === requestId) setSharedLoading(false);
    }
  }, [onMessage, session]);
  useEffect(() => {
    let active = true;
    if (open && isSupabaseConfigured) void restoreSupabaseSession().then((restored) => {
      if (!active) return;
      setSession(restored);
      if (restored) { const name = supabaseDisplayName(restored.user); setUserName(name); setUserDraft(name); }
    });
    return () => { active = false; };
  }, [open]);
  useEffect(() => () => { refreshRequestRef.current += 1; }, []);
  useEffect(() => { if (open) void refreshShared(); }, [open, refreshShared]);
  useEffect(() => open && session ? subscribeSharedProjects(() => void refreshShared()) : undefined, [open, refreshShared, session]);

  const submitLogin = async () => {
    if (!credentials.email.trim() || !credentials.password) return;
    setAuthBusy(true);
    try { const next = await signInWithPassword(credentials.email.trim(), credentials.password); setSession(next); const name = supabaseDisplayName(next.user); setUserName(name); setUserDraft(name); setCredentials({ email: '', password: '' }); onMessage(`${name} 계정으로 로그인했습니다.`); }
    catch { onMessage('Supabase 로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.'); }
    finally { setAuthBusy(false); }
  };
  const logout = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      await signOutSupabase();
      setSession(null);
      setShared([]);
      onMessage('Supabase에서 로그아웃했습니다.');
    } catch {
      onMessage('Supabase 로그아웃에 실패했습니다. 연결을 확인해 주세요.');
    } finally {
      setAuthBusy(false);
    }
  };

  const requestSwitch = (label: string, run: () => Promise<void>) => setPendingSwitch({ label, run });
  const completeSwitch = async (saveFirst: boolean) => {
    if (!pendingSwitch) return;
    if (saveFirst) {
      try { saveStoredProject(currentProject); await syncActiveSharedProject(currentProject); }
      catch (error) { onMessage(error instanceof Error && error.message === 'LAYOUT_VERSION_CONFLICT' ? '저장 충돌을 먼저 해결해 주세요.' : '현재 배치안 저장에 실패하여 전환을 중단했습니다.'); return; }
    }
    const run = pendingSwitch.run;
    setPendingSwitch(null);
    await run();
  };

  const changeUser = () => {
    const next = userDraft.trim();
    if (!next) return;
    localStorage.setItem('aiad-user-name', next); setUserName(next); setUserEditing(false); onMessage(`사용자 이름을 ${next}(으)로 변경했습니다.`);
  };

  const archiveCurrent = () => {
    saveProjectSnapshot(currentProject);
    setEntries(loadProjectLibrary());
    onMessage('현재 배치안을 보관했습니다.');
  };

  const openSavedProject = (project: LayoutProject) => requestSwitch(project.projectName, async () => {
    setActiveSharedProject(null);
    onOpenProject(project);
    onClose();
  });

  const deleteSavedProject = (entry: StoredProjectEntry) => {
    setEntries(deleteProjectSnapshot(entry.id));
    setPendingDeleteId(null);
    onMessage('보관된 배치안을 삭제했습니다.');
  };

  const createNew = () => {
    const name = newName.trim() || '새 연구실 배치안';
    const blank = createInitialProject();
    blank.projectName = name;
    requestSwitch(name, async () => { setActiveSharedProject(null); onOpenProject(blank); setNewName(''); setShowNewForm(false); onClose(); onMessage(`새 배치안 "${name}"을 만들었습니다.`); });
  };

  const saveAsShared = (project = currentProject, suggestedName = currentProject.projectName) => {
    if (isSupabaseConfigured && !session) { onMessage('공용 배치안 게시 전에 로그인해 주세요.'); return; }
    setSharedForm({ project, name: suggestedName, author: session ? supabaseDisplayName(session.user) : userName, description: '' });
  };

  const submitShared = async () => {
    if (sharedCreateInFlightRef.current || !sharedForm?.name.trim() || !sharedForm.author.trim()) return;
    const name = sharedForm.name.trim(); const author = sharedForm.author.trim(); const description = sharedForm.description.trim(); const source = sharedForm.project;
    sharedCreateInFlightRef.current = true;
    setSharedCreateBusy(true);
    try {
      const saved = await createSharedProject({ name, author_name: author, description, layout_data: { ...source, projectName: name } });
      setActiveSharedProject({ id: saved.id, name: saved.name, author_name: saved.author_name, description: saved.description, version: saved.version });
      localStorage.setItem('aiad-user-name', author); setUserName(author); setUserDraft(author);
      onOpenProject({ ...source, projectName: name }); setSharedForm(null);
      await refreshShared();
      onMessage('공용 배치안으로 저장했습니다.');
    } catch { onMessage('공용 배치안 저장에 실패했습니다. 권한과 연결을 확인해 주세요.'); }
    finally { sharedCreateInFlightRef.current = false; setSharedCreateBusy(false); }
  };

  const openSharedNow = async (entry: SharedProjectSummary) => {
    try {
      const record = await getSharedProject(entry.id);
      setActiveSharedProject({ id: record.id, name: record.name, author_name: record.author_name, description: record.description, version: record.version });
      onOpenProject({ ...record.layout_data, projectName: record.name });
      onClose();
    } catch { onMessage('공용 배치안을 열지 못했습니다.'); }
  };
  const openShared = (entry: SharedProjectSummary) => requestSwitch(entry.name, () => openSharedNow(entry));

  const duplicateShared = async (entry: SharedProjectSummary) => {
    try { const record = await getSharedProject(entry.id); saveAsShared(record.layout_data, `${entry.name} 복사본`); }
    catch { onMessage('공용 배치안 복제에 실패했습니다.'); }
  };

  const submitRename = async () => {
    if (!renameForm?.name.trim()) return;
    try { await renameSharedProject(renameForm.entry, renameForm.name.trim()); setRenameForm(null); await refreshShared(); onMessage('공용 배치안 이름을 변경했습니다.'); }
    catch { onMessage('이름 변경 중 버전 충돌이 발생했습니다. 목록을 새로 불러왔습니다.'); await refreshShared(); }
  };

  const confirmArchiveShared = async () => {
    if (!archiveTarget) return;
    try { await archiveSharedProject(archiveTarget); setArchiveTarget(null); await refreshShared(); onMessage('공용 배치안을 보관 처리했습니다.'); }
    catch { onMessage('보관 처리 중 버전 충돌이 발생했습니다.'); await refreshShared(); }
  };

  const confirmReset = () => {
    if (pendingReset === 'furniture') onResetFurniture();
    if (pendingReset === 'official') onResetAll();
    setPendingReset(null);
  };

  return (
    <ModalFrame open={open} onClose={onClose} labelledBy="project-dialog-title" className="app-dialog project-dialog">
      <DialogHeader titleId="project-dialog-title" title="배치안 관리" description="새 배치안을 만들고 로컬·공용 버전을 관리합니다." onClose={onClose} autofocusClose />
      <div className="dialog-body">
        {pendingSwitch && <section className="switch-project-confirm" role="alert" aria-label="프로젝트 전환 확인"><strong>“{pendingSwitch.label}” 배치안을 여시겠습니까?</strong><p>현재 배치안을 먼저 저장하거나 변경사항을 버리고 전환할 수 있습니다.</p><div><button onClick={() => setPendingSwitch(null)}>취소</button><button onClick={() => void completeSwitch(false)}>버리고 열기</button><button className="button-primary" onClick={() => void completeSwitch(true)}>저장 후 열기</button></div></section>}
        {isSupabaseConfigured && !session && <section className="inline-project-form"><h3>Supabase 로그인</h3><label className="field"><span>이메일</span><input type="email" value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })} /></label><label className="field"><span>비밀번호</span><input type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} /></label><div><button className="button-primary" disabled={authBusy || !credentials.email.trim() || !credentials.password} onClick={() => void submitLogin()}>{authBusy ? '로그인 중…' : '로그인'}</button></div></section>}
        {userEditing && !isSupabaseConfigured && <section className="inline-project-form"><h3>사용자 이름 변경</h3><label className="field"><span>이름</span><input value={userDraft} maxLength={40} onChange={(event) => setUserDraft(event.target.value)} /></label><div><button onClick={() => { setUserDraft(userName); setUserEditing(false); }}>취소</button><button className="button-primary" onClick={changeUser}>변경</button></div></section>}
        {sharedForm && <section className="inline-project-form"><h3>공용 배치안 저장</h3><label className="field"><span>배치안 이름</span><input value={sharedForm.name} maxLength={80} disabled={sharedCreateBusy} onChange={(event) => setSharedForm({ ...sharedForm, name: event.target.value })} /></label><label className="field"><span>작성자</span><input value={sharedForm.author} maxLength={40} disabled={sharedCreateBusy} onChange={(event) => setSharedForm({ ...sharedForm, author: event.target.value })} /></label><label className="field"><span>설명</span><textarea rows={3} value={sharedForm.description} maxLength={500} disabled={sharedCreateBusy} onChange={(event) => setSharedForm({ ...sharedForm, description: event.target.value })} /></label><div><button onClick={() => setSharedForm(null)} disabled={sharedCreateBusy}>취소</button><button className="button-primary" onClick={() => void submitShared()} disabled={sharedCreateBusy || !sharedForm.name.trim() || !sharedForm.author.trim()}>{sharedCreateBusy ? '저장 중…' : '저장'}</button></div></section>}
        {renameForm && <section className="inline-project-form"><h3>공용 배치안 이름 변경</h3><label className="field"><span>새 이름</span><input value={renameForm.name} maxLength={80} onChange={(event) => setRenameForm({ ...renameForm, name: event.target.value })} /></label><div><button onClick={() => setRenameForm(null)}>취소</button><button className="button-primary" onClick={() => void submitRename()}>변경</button></div></section>}
        {archiveTarget && <section className="switch-project-confirm"><strong>“{archiveTarget.name}” 배치안을 보관하시겠습니까?</strong><p>공용 목록에서는 숨겨지고 데이터베이스에는 보관됩니다.</p><div><button onClick={() => setArchiveTarget(null)}>취소</button><button className="button-danger" onClick={() => void confirmArchiveShared()}>보관</button></div></section>}
        <section className="current-project-card">
          <div><span>현재 배치안</span><strong>{currentProject.projectName}</strong><small>{currentProject.objects.length}개 객체</small></div>
          {isSupabaseConfigured ? <button onClick={() => void logout()} disabled={!session || authBusy}><Icon name="user" size={16} />{session ? `${supabaseDisplayName(session.user)} 로그아웃` : '로그인 필요'}</button> : <button onClick={() => { setUserDraft(userName); setUserEditing(true); }}><Icon name="user" size={16} />{userName || '로컬 사용자 설정'}</button>}
          <button onClick={archiveCurrent}><Icon name="save" size={16} />로컬 버전 보관</button>
          {isSupabaseConfigured && <button onClick={() => saveAsShared()}><Icon name="save" size={16} />공용 배치안으로 게시</button>}
        </section>
        <section className="saved-projects-section danger-zone">
          <div className="saved-projects-heading"><h3>초기화</h3><span>실행 취소 가능</span></div>
          <p className="section-description">현재 작업을 되돌릴 수 있는 기록을 남기고 배치를 초기 상태로 복원합니다.</p>
          <div className="property-actions"><button onClick={() => setPendingReset('furniture')}>가구 배치 초기화</button><button className="button-danger" onClick={() => setPendingReset('official')}>공식 도면 전체 복원</button></div>
          {pendingReset && <div className="danger-confirmation" role="alert"><div><strong>{pendingReset === 'furniture' ? '가구 배치를 초기화하시겠습니까?' : '공식 도면으로 전체 복원하시겠습니까?'}</strong><p>{pendingReset === 'furniture' ? '벽·문·창문과 고정 시설은 유지하고 배치 가구만 제거합니다.' : '현재 도면의 모든 변경을 공식 도면 리비전 7 상태로 되돌립니다.'}</p></div><div><button onClick={() => setPendingReset(null)}>취소</button><button className="button-danger" onClick={confirmReset}>{pendingReset === 'furniture' ? '가구 초기화' : '전체 복원'}</button></div></div>}
        </section>
        <section className="saved-projects-section shared-projects-section">
          <div className="saved-projects-heading"><h3>공용 배치안</h3><span>{isSupabaseConfigured ? `${shared.length}개` : '설정 필요'}</span></div>
          {!isSupabaseConfigured ? <p className="saved-projects-empty">`.env`에 공개 Supabase URL과 anon 키를 설정하면 활성화됩니다. secret 또는 service-role 키는 사용하지 않습니다.</p> : !session ? <p className="saved-projects-empty">로그인하면 인증 사용자 권한으로 공용 배치안을 읽고 게시할 수 있습니다.</p> : <>
            <div className="shared-project-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 작성자 검색" aria-label="공용 배치안 검색" /><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="공용 배치안 정렬"><option value="updated">최근 수정순</option><option value="name">이름순</option><option value="author">작성자순</option></select></div>
            {sharedLoading ? <div className="project-skeleton" role="status" aria-label="공용 배치안을 불러오는 중입니다.">{[0, 1, 2].map((index) => <span key={index}><i /><b /></span>)}</div> : visibleShared.length === 0 ? <p className="saved-projects-empty">검색 조건에 맞는 공용 배치안이 없습니다.</p> : <ul className="saved-project-list">{visibleShared.map((entry) => <li key={entry.id}><button className="saved-project-open" onClick={() => openShared(entry)}><span><strong>{entry.name}</strong><small>{entry.author_name} · v{entry.version}</small></span><Icon name="chevron-right" /></button><div className="shared-project-actions"><button onClick={() => void duplicateShared(entry)}>복제</button><button onClick={() => setRenameForm({ entry, name: entry.name })}>이름</button><button onClick={() => setArchiveTarget(entry)}>보관</button></div></li>)}</ul>}
            {legacyProject && <button className="new-project-button" onClick={() => saveAsShared(legacyProject, '기존 로컬 배치안')}>기존 LocalStorage 배치안을 공용 저장소로 마이그레이션</button>}
          </>}
        </section>
        <section className="new-project-section">
          {showNewForm ? (
            <div className="new-project-form">
              <label className="field">
                <span>배치안 이름</span>
                <input
                  type="text"
                  value={newName}
                  placeholder="새 연구실 배치안"
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') createNew(); if (event.key === 'Escape') { setShowNewForm(false); setNewName(''); } }}
                  autoFocus
                />
              </label>
              <div className="new-project-actions">
                <button onClick={() => { setShowNewForm(false); setNewName(''); }}>취소</button>
                <button className="button-primary" onClick={createNew}><Icon name="plus" size={16} />만들기</button>
              </div>
            </div>
          ) : (
            <button className="new-project-button" onClick={() => setShowNewForm(true)}><Icon name="plus" size={16} />새 배치안 만들기</button>
          )}
        </section>
        <section className="saved-projects-section">
          <div className="saved-projects-heading"><h3>보관된 배치안</h3><span>{entries.length}개</span></div>
          {entries.length === 0 ? <p className="saved-projects-empty">아직 보관된 배치안이 없습니다.</p> : (
            <ul className="saved-project-list">
              {entries.map((entry) => (
                <li key={entry.id} className={pendingDeleteId === entry.id ? 'is-confirming' : ''}>
                  {pendingDeleteId === entry.id ? (
                    <div className="saved-project-confirm" role="group" aria-label={`${entry.project.projectName} 삭제 확인`}>
                      <span><strong>{entry.project.projectName}</strong><small>이 배치안을 삭제하시겠습니까?</small></span>
                      <button onClick={() => setPendingDeleteId(null)}>취소</button>
                      <button className="confirm-delete" onClick={() => deleteSavedProject(entry)}>삭제</button>
                    </div>
                  ) : (
                    <>
                      <button className="saved-project-open" onClick={() => openSavedProject(entry.project)}><span><strong>{entry.project.projectName}</strong><small>{entry.project.objects.length}개 객체 · {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.savedAt))}</small></span><Icon name="chevron-right" /></button>
                      <button className="saved-project-delete" onClick={() => setPendingDeleteId(entry.id)} title="보관된 배치안 삭제" aria-label={`${entry.project.projectName} 삭제`}><Icon name="trash" size={16} /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ModalFrame>
  );
}
