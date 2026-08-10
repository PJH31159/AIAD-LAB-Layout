(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  class ProjectManager {
    constructor(app) {
      this.app = app;
      this.api = new window.AIADLayoutsAPI(window.AIAD_SUPABASE_CONFIG);
      this.layouts = [];
      this.current = null;
      this.dirty = false;
      this.saving = false;
      this.saveTimer = null;
      this.userName = localStorage.getItem('aiad-user-name') || '';
    }

    async init() {
      this.bindUI();
      if (!this.userName) await this.requestUserName();
      this.updateIdentity();
      this.renderLegacyMigration();
      if (!this.api.configured) {
        this.setStatus('서버 설정 필요', 'error');
        $('#shared-layout-status').textContent = 'Supabase 설정 후 공용 배치안을 사용할 수 있습니다. 빈 연구실 편집은 계속 가능합니다.';
        return;
      }
      this.setStatus('서버 연결 중…', 'saving');
      await this.loadList();
      this.api.subscribe(() => this.loadList(false));
      this.setStatus('공용 배치안 선택 필요', 'idle');
    }

    bindUI() {
      $('#new-shared-layout').addEventListener('click', () => this.createBlank());
      $('#layout-search').addEventListener('input', () => this.renderList());
      $('#layout-sort').addEventListener('change', () => this.renderList());
      $('#shared-layout-list').addEventListener('click', e => this.handleListAction(e));
      $('#legacy-import').addEventListener('click', () => this.importLegacy());
      $('#change-user').addEventListener('click', () => this.requestUserName(true));
      $('#retry-server-save').addEventListener('click', () => this.saveCurrent(true));
      $('#user-dialog').addEventListener('cancel', e => e.preventDefault());
    }

    requestUserName(change = false) {
      const dialog = $('#user-dialog'), input = $('#user-name-input');
      input.value = this.userName;
      dialog.showModal();
      return new Promise(resolve => {
        const submit = e => {
          e.preventDefault();
          const name = input.value.trim();
          if (!name) return input.focus();
          this.userName = name; localStorage.setItem('aiad-user-name', name); this.updateIdentity(); dialog.close();
          $('#user-form').removeEventListener('submit', submit); resolve(name);
        };
        $('#user-form').addEventListener('submit', submit);
        if (change) input.select();
      });
    }

    updateIdentity() {
      $('#current-user').textContent = this.userName || '사용자 미설정';
      $('#current-author').textContent = this.current?.author_name || this.userName || '—';
    }

    setStatus(text, kind = 'idle') {
      const node = $('#autosave'), dot = $('.status-dot');
      node.textContent = text; node.dataset.status = kind; dot.dataset.status = kind;
      $('#retry-server-save').hidden = kind !== 'error';
    }

    async loadList(showLoading = true) {
      if (showLoading) $('#shared-layout-status').textContent = '배치안을 불러오는 중입니다…';
      try {
        this.layouts = await this.api.list();
        $('#shared-layout-status').textContent = this.layouts.length ? '' : '아직 공용 배치안이 없습니다.';
        this.renderList();
        if (!this.dirty) this.setStatus('모든 변경사항 저장됨', 'saved');
      } catch (error) {
        $('#shared-layout-status').textContent = '공용 배치안을 불러올 수 없습니다.';
        this.setStatus('서버 연결 오류', 'error');
      }
    }

    renderList() {
      const q = $('#layout-search').value.trim().toLowerCase(), sort = $('#layout-sort').value;
      const rows = this.layouts.filter(x => !q || x.name.toLowerCase().includes(q) || x.author_name.toLowerCase().includes(q));
      rows.sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name, 'ko') : sort === 'author' ? a.author_name.localeCompare(b.author_name, 'ko') : new Date(b.updated_at) - new Date(a.updated_at));
      $('#shared-layout-list').innerHTML = rows.map(item => `<article class="shared-layout-card ${this.current?.id===item.id?'active':''}" data-id="${item.id}"><button class="layout-open" data-layout-command="open"><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.author_name)} · ${this.relativeTime(item.updated_at)}</span></button><div class="layout-card-actions"><button data-layout-command="duplicate" title="복제">⧉</button><button data-layout-command="rename" title="이름 변경">✎</button><button data-layout-command="archive" title="삭제">⋯</button></div></article>`).join('');
    }

    relativeTime(value) {
      const minutes = Math.max(0, Math.round((Date.now() - new Date(value)) / 60000));
      if (minutes < 1) return '방금 수정'; if (minutes < 60) return `${minutes}분 전`; if (minutes < 1440) return `${Math.floor(minutes/60)}시간 전`;
      return new Date(value).toLocaleDateString('ko-KR');
    }

    async handleListAction(e) {
      const button = e.target.closest('[data-layout-command]'); if (!button) return;
      const card = button.closest('[data-id]'), id = card.dataset.id, command = button.dataset.layoutCommand;
      if (command === 'open') await this.open(id);
      if (command === 'duplicate') await this.duplicate(id);
      if (command === 'rename') await this.rename(id);
      if (command === 'archive') await this.archive(id);
    }

    layoutDialog({ title, name = '', author = this.userName, description = '' }) {
      const dialog = $('#layout-dialog'); $('#layout-dialog-title').textContent = title; $('#layout-name-input').value = name; $('#layout-author-input').value = author; $('#layout-description-input').value = description;
      dialog.showModal();
      return new Promise(resolve => {
        const close = result => { dialog.close(); $('#layout-form').removeEventListener('submit', submit); $('#layout-dialog-cancel').removeEventListener('click', cancel); resolve(result); };
        const submit = e => { e.preventDefault(); const result = { name: $('#layout-name-input').value.trim(), author_name: $('#layout-author-input').value.trim(), description: $('#layout-description-input').value.trim() }; if (result.name && result.author_name) close(result); };
        const cancel = () => close(null);
        $('#layout-form').addEventListener('submit', submit); $('#layout-dialog-cancel').addEventListener('click', cancel); $('#layout-name-input').focus();
      });
    }

    async createBlank() {
      if (this.dirty) {
        const choice = await this.switchChoice();
        if (choice === 'cancel') return;
        if (choice === 'save') { await this.saveCurrent(true); if (this.dirty) return; }
      }
      const meta = await this.layoutDialog({ title: '새 공용 배치안', name: '새 배치안' }); if (!meta) return;
      this.app.startBlank(meta.name); this.current = { id: null, version: 0, ...meta }; this.dirty = true; this.updateIdentity();
      await this.saveCurrent(true);
    }

    async saveCurrent(force = false) {
      clearTimeout(this.saveTimer);
      if (this.saving) return;
      if (!this.api.configured) { this.app.backupDraft(); this.setStatus('서버 설정 필요 · 임시 백업됨', 'error'); return; }
      if (!this.current) {
        const meta = await this.layoutDialog({ title: '새 공용 배치안으로 저장', name: this.app.getProject().projectName === '빈 연구실' ? '새 배치안' : this.app.getProject().projectName });
        if (!meta) return; this.current = { id: null, version: 0, ...meta };
      }
      this.saving = true; this.setStatus('저장 중…', 'saving');
      try {
        const project = this.app.getProject(); project.projectName = this.current.name;
        const input = { name: this.current.name, author_name: this.current.author_name || this.userName, description: this.current.description || '', layout_data: project, thumbnail: null };
        const saved = this.current.id ? await this.api.update(this.current.id, this.current.version, input) : await this.api.create(input);
        this.current = saved; this.dirty = false; localStorage.setItem('aiad-recent-layout-id', saved.id); this.app.clearDraft(); this.updateIdentity(); this.renderList();
        this.setStatus(`저장 완료 · ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`, 'saved'); this.app.toast('✓ 배치안을 저장했습니다.'); await this.loadList(false);
      } catch (error) {
        this.app.backupDraft();
        if (error.code === 'LAYOUT_VERSION_CONFLICT' || error.message === 'LAYOUT_VERSION_CONFLICT') { this.saving = false; await this.resolveConflict(); }
        else { this.setStatus('서버 저장 실패 · 임시 백업됨', 'error'); this.app.toast('✕ 서버 저장에 실패했습니다.'); }
      } finally { this.saving = false; }
    }

    onLocalChange() {
      this.dirty = true; this.app.backupDraft(); this.setStatus(this.current?.id ? '저장되지 않은 변경사항' : '공용 배치안으로 저장 필요', 'dirty');
      if (this.current?.id && this.api.configured) { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.saveCurrent(), 1600); }
    }

    detachCurrent() {
      clearTimeout(this.saveTimer); this.current = null; this.dirty = true; this.updateIdentity(); this.renderList();
    }

    async open(id, initial = false) {
      if (this.dirty && !initial) {
        const choice = await this.switchChoice(); if (choice === 'cancel') return; if (choice === 'save') { await this.saveCurrent(true); if (this.dirty) return; }
      }
      this.setStatus('배치안을 여는 중…', 'saving');
      try {
        const record = await this.api.get(id); record.layout_data.projectName = record.name; this.app.loadProject(record.layout_data); this.current = record; this.dirty = false; localStorage.setItem('aiad-recent-layout-id', id); this.updateIdentity(); this.renderList(); this.setStatus('모든 변경사항 저장됨', 'saved');
      } catch { this.setStatus('배치안을 열 수 없습니다', 'error'); this.app.toast('✕ 공용 배치안을 불러오지 못했습니다.'); }
    }

    switchChoice() {
      const dialog = $('#switch-dialog'); dialog.showModal();
      return new Promise(resolve => { const handler = e => { const choice = e.target.dataset.switchChoice; if (!choice) return; dialog.removeEventListener('click', handler); dialog.close(); resolve(choice); }; dialog.addEventListener('click', handler); });
    }

    async duplicate(id) {
      try {
        const source = await this.api.get(id), meta = await this.layoutDialog({ title: '배치안 복제', name: `${source.name} - ${this.userName} 수정`, author: this.userName, description: source.description }); if (!meta) return;
        const saved = await this.api.create({ ...meta, layout_data: source.layout_data, thumbnail: source.thumbnail }); this.app.toast('✓ 배치안을 복제했습니다.'); await this.loadList(false); await this.open(saved.id, true);
      } catch { this.app.toast('✕ 배치안 복제에 실패했습니다.'); }
    }

    async rename(id) {
      const item = this.layouts.find(x => x.id === id), name = prompt('새 배치안 이름', item?.name || ''); if (!name?.trim()) return;
      try { const saved=await this.api.rename(id, item.version, name); if(this.current?.id===id){this.current=saved;this.app.setProjectName(saved.name);this.updateIdentity();} this.app.toast('✓ 이름을 변경했습니다.'); await this.loadList(false); }
      catch { this.app.toast('⚠ 다른 사용자가 이 배치안을 수정했거나 이름 변경에 실패했습니다.'); }
    }

    async archive(id) {
      const item = this.layouts.find(x => x.id === id), dialog = $('#delete-layout-dialog');
      $('#delete-layout-title').textContent = `“${item?.name || '배치안'}”을 삭제하시겠습니까?`; dialog.showModal();
      const confirmed = await new Promise(resolve => { const handler = e => { const choice=e.target.dataset.deleteChoice;if(!choice)return;dialog.removeEventListener('click',handler);dialog.close();resolve(choice==='delete');};dialog.addEventListener('click',handler); });
      if (!confirmed) return;
      try { await this.api.archive(id, item.version); if (this.current?.id === id) { this.current = null; this.app.startBlank('빈 연구실'); } this.app.toast('✓ 배치안을 삭제했습니다.'); await this.loadList(false); }
      catch { this.app.toast('✕ 배치안 삭제에 실패했습니다.'); }
    }

    async resolveConflict() {
      this.setStatus('다른 사용자가 수정함', 'error'); const dialog = $('#conflict-dialog'); dialog.showModal();
      const choice = await new Promise(resolve => { const handler = e => { const value=e.target.dataset.conflictChoice; if(!value)return;dialog.removeEventListener('click',handler);dialog.close();resolve(value);};dialog.addEventListener('click',handler); });
      if (choice === 'latest') await this.open(this.current.id, true);
      if (choice === 'copy') { const meta = await this.layoutDialog({ title:'내 배치안을 복사본으로 저장', name:`${this.current.name} - ${this.userName} 복사본`, author:this.userName, description:this.current.description }); if(meta){this.current={id:null,version:0,...meta};await this.saveCurrent(true);} }
    }

    renderLegacyMigration() { $('#legacy-migration').hidden = !this.app.hasLegacyProject(); }
    async importLegacy() {
      const project = this.app.getLegacyProject(); if (!project) return;
      const meta = await this.layoutDialog({ title:'기존 브라우저 배치안 가져오기', name:'기존 로컬 배치안', author:this.userName, description:'이 브라우저의 LocalStorage에서 가져옴' }); if(!meta)return;
      try { const saved=await this.api.create({...meta,layout_data:project,thumbnail:null});this.app.toast('✓ 기존 배치안을 공용 프로젝트로 가져왔습니다.');await this.loadList(false);await this.open(saved.id,true); }
      catch { this.app.toast('✕ 기존 배치안을 가져오지 못했습니다.'); }
    }
  }

  function start() {
    if (!window.AIAD_APP) return setTimeout(start, 0);
    window.AIADProjectManager = new ProjectManager(window.AIAD_APP);
    window.AIADProjectManager.init();
  }
  start();
})();
