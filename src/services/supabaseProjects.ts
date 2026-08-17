import type { LayoutProject } from '../types/layout';
import { parseProject } from '../utils/serialization';

export type SharedProjectSummary = { id: string; name: string; author_name: string; description: string; created_at: string; updated_at: string; version: number };
export type SharedProjectRecord = SharedProjectSummary & { layout_data: LayoutProject; thumbnail?: string | null; is_archived?: boolean };
export type ActiveSharedProject = Pick<SharedProjectRecord, 'id' | 'name' | 'author_name' | 'description' | 'version'>;
export type SupabaseUser = { id: string; email?: string; user_metadata?: { display_name?: string; full_name?: string; name?: string } };
export type SupabaseSession = { access_token: string; refresh_token: string; expires_at?: number; expires_in?: number; user: SupabaseUser };

const ACTIVE_KEY = 'aiad-active-shared-project-v1';
const SESSION_KEY = 'aiad-supabase-session-v1';
const PENDING_SYNC_KEY = 'aiad-pending-shared-sync-v1';
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isSupabaseConfigured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && Boolean(anonKey);
let refreshInFlight: Promise<SupabaseSession | null> | null = null;
let syncQueue: Promise<unknown> = Promise.resolve();

function headers(prefer?: string) {
  const accessToken = getSupabaseSession()?.access_token || anonKey || '';
  return { apikey: anonKey || '', Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) };
}

export function setSupabaseAccessToken(token: string | null) {
  if (token) localStorage.setItem('aiad-supabase-access-token', token);
  else localStorage.removeItem('aiad-supabase-access-token');
}

export function getSupabaseAccessToken() {
  return getSupabaseSession()?.access_token ?? localStorage.getItem('aiad-supabase-access-token');
}

export function getSupabaseSession(): SupabaseSession | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as SupabaseSession | null; } catch { return null; }
}

function storeSession(session: SupabaseSession | null) {
  if (!session) { localStorage.removeItem(SESSION_KEY); setSupabaseAccessToken(null); return; }
  const expires_at = session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600);
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, expires_at }));
  setSupabaseAccessToken(session.access_token);
}

async function authRequest(path: string, body: Record<string, string>, token?: string) {
  if (!isSupabaseConfigured) throw new Error('SUPABASE_NOT_CONFIGURED');
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: anonKey || '', Authorization: `Bearer ${token || anonKey || ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`SUPABASE_AUTH_${response.status}`);
  return response;
}

export async function signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
  const response = await authRequest('token?grant_type=password', { email, password });
  const session = await response.json() as SupabaseSession;
  storeSession(session);
  return session;
}

export async function restoreSupabaseSession(): Promise<SupabaseSession | null> {
  const current = getSupabaseSession();
  if (!current) return null;
  if ((current.expires_at ?? 0) > Math.floor(Date.now() / 1000) + 60) return current;
  if (!refreshInFlight) refreshInFlight = (async () => {
    try {
      const response = await authRequest('token?grant_type=refresh_token', { refresh_token: current.refresh_token });
      const refreshed = await response.json() as SupabaseSession;
      storeSession(refreshed);
      return refreshed;
    } catch {
      storeSession(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function signOutSupabase() {
  const session = getSupabaseSession();
  if (session) {
    try { await authRequest('logout', {}, session.access_token); } catch { /* local session still needs to end */ }
  }
  storeSession(null);
  setActiveSharedProject(null);
}

export function supabaseDisplayName(user: SupabaseUser) {
  return user.user_metadata?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email || user.id;
}

export function shouldRetryRequest(method: string | undefined, error: unknown, attempts: number) {
  const normalized = (method ?? 'GET').toUpperCase();
  return attempts > 0 && error instanceof TypeError && (normalized === 'GET' || normalized === 'HEAD');
}

async function request<T>(path: string, init: RequestInit = {}, attempts = 2): Promise<T> {
  if (!isSupabaseConfigured) throw new Error('SUPABASE_NOT_CONFIGURED');
  if (!navigator.onLine) throw new Error('OFFLINE');
  try {
    const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers(init.method && init.method !== 'GET' ? 'return=representation' : undefined), ...init.headers } });
    if (!response.ok) throw new Error(`SUPABASE_${response.status}`);
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (shouldRetryRequest(init.method, error, attempts)) {
      await new Promise((resolve) => window.setTimeout(resolve, (3 - attempts) * 350));
      return request<T>(path, init, attempts - 1);
    }
    throw error;
  }
}

export function getActiveSharedProject(): ActiveSharedProject | null {
  try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null') as ActiveSharedProject | null; } catch { return null; }
}
export function clearPendingSharedProjectSync() { localStorage.removeItem(PENDING_SYNC_KEY); }
export function hasPendingSharedProjectSync() {
  const active = getActiveSharedProject();
  if (!active) return false;
  try { return (JSON.parse(localStorage.getItem(PENDING_SYNC_KEY) || 'null') as { id?: string } | null)?.id === active.id; } catch { return false; }
}
export function setActiveSharedProject(record: ActiveSharedProject | null) {
  const previous = getActiveSharedProject();
  if (record) localStorage.setItem(ACTIVE_KEY, JSON.stringify(record));
  else localStorage.removeItem(ACTIVE_KEY);
  if (!record || previous?.id !== record.id) clearPendingSharedProjectSync();
}

export async function listSharedProjects(): Promise<SharedProjectSummary[]> {
  return request<SharedProjectSummary[]>('layouts?select=id,name,author_name,description,created_at,updated_at,version&is_archived=eq.false&order=updated_at.desc');
}
export async function getSharedProject(id: string): Promise<SharedProjectRecord> {
  const rows = await request<SharedProjectRecord[]>(`layouts?select=*&id=eq.${encodeURIComponent(id)}&is_archived=eq.false&limit=1`);
  if (!rows[0]) throw new Error('LAYOUT_NOT_FOUND');
  return { ...rows[0], layout_data: parseProject(JSON.stringify(rows[0].layout_data)) };
}
export async function createSharedProject(input: { name: string; author_name: string; description?: string; layout_data: LayoutProject }): Promise<SharedProjectRecord> {
  const session = await restoreSupabaseSession();
  if (!session) throw new Error('SUPABASE_AUTH_REQUIRED');
  const rows = await request<SharedProjectRecord[]>('layouts', { method: 'POST', body: JSON.stringify({ ...input, author_name: supabaseDisplayName(session.user), owner_id: session.user.id, description: input.description ?? '', thumbnail: null, version: 1, is_archived: false }) });
  if (!rows[0]) throw new Error('LAYOUT_CREATE_FAILED');
  return rows[0];
}
export async function updateSharedProject(id: string, expectedVersion: number, input: { name: string; author_name: string; description?: string; layout_data: LayoutProject }): Promise<SharedProjectRecord> {
  const session = await restoreSupabaseSession();
  if (!session) throw new Error('SUPABASE_AUTH_REQUIRED');
  const rows = await request<SharedProjectRecord[]>(`layouts?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(session.user.id)}&version=eq.${expectedVersion}&is_archived=eq.false`, { method: 'PATCH', body: JSON.stringify({ ...input, author_name: supabaseDisplayName(session.user), owner_id: session.user.id, description: input.description ?? '', version: expectedVersion + 1, updated_at: new Date().toISOString() }) });
  if (!rows[0]) throw new Error('LAYOUT_VERSION_CONFLICT');
  return rows[0];
}
export async function renameSharedProject(record: SharedProjectSummary, name: string) {
  const session = await restoreSupabaseSession(); if (!session) throw new Error('SUPABASE_AUTH_REQUIRED');
  const rows = await request<SharedProjectRecord[]>(`layouts?id=eq.${encodeURIComponent(record.id)}&owner_id=eq.${encodeURIComponent(session.user.id)}&version=eq.${record.version}&is_archived=eq.false`, { method: 'PATCH', body: JSON.stringify({ name, version: record.version + 1, updated_at: new Date().toISOString() }) });
  if (!rows[0]) throw new Error('LAYOUT_VERSION_CONFLICT');
  return rows[0];
}
export async function archiveSharedProject(record: SharedProjectSummary) {
  const session = await restoreSupabaseSession(); if (!session) throw new Error('SUPABASE_AUTH_REQUIRED');
  const rows = await request<SharedProjectRecord[]>(`layouts?id=eq.${encodeURIComponent(record.id)}&owner_id=eq.${encodeURIComponent(session.user.id)}&version=eq.${record.version}&is_archived=eq.false`, { method: 'PATCH', body: JSON.stringify({ is_archived: true, version: record.version + 1, updated_at: new Date().toISOString() }) });
  if (!rows[0]) throw new Error('LAYOUT_VERSION_CONFLICT');
}
export function syncActiveSharedProject(project: LayoutProject): Promise<'local' | 'server-saved'> {
  const requestedActive = getActiveSharedProject();
  if (!requestedActive || !isSupabaseConfigured) return Promise.resolve('local');
  localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify({ id: requestedActive.id, updatedAt: project.updatedAt }));
  const run = async (): Promise<'local' | 'server-saved'> => {
    const active = getActiveSharedProject();
    if (!active || active.id !== requestedActive.id) return 'local';
    const saved = await updateSharedProject(active.id, active.version, { name: project.projectName, author_name: active.author_name, description: active.description, layout_data: project });
    const latestActive = getActiveSharedProject();
    if (!latestActive || latestActive.id !== active.id || latestActive.version !== active.version) return 'local';
    setActiveSharedProject({ id: saved.id, name: saved.name, author_name: saved.author_name, description: saved.description, version: saved.version });
    clearPendingSharedProjectSync();
    return 'server-saved';
  };
  const result = syncQueue.then(run, run);
  syncQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function subscribeSharedProjects(onChange: () => void): () => void {
  if (!isSupabaseConfigured) return () => undefined;
  let disposed = false;
  let socket: WebSocket | null = null;
  let heartbeat: number | null = null;
  let poll: number | null = null;
  let reconnect: number | null = null;
  let fallbackDelay: number | null = null;
  let joined = false;
  let reconnectAttempts = 0;
  const projectUrl = new URL(url);
  const realtimeUrl = `wss://${projectUrl.host}/realtime/v1/websocket?apikey=${encodeURIComponent(anonKey ?? '')}&vsn=1.0.0`;
  const stopPolling = () => { if (poll !== null) window.clearInterval(poll); poll = null; };
  const stopConnectionTimers = () => {
    if (heartbeat !== null) window.clearInterval(heartbeat);
    if (fallbackDelay !== null) window.clearTimeout(fallbackDelay);
    heartbeat = null;
    fallbackDelay = null;
  };
  const startPolling = () => { if (poll === null) poll = window.setInterval(() => { if (!disposed && document.visibilityState === 'visible' && navigator.onLine) onChange(); }, 15000); };
  const connect = () => { try {
    socket = new WebSocket(realtimeUrl);
    socket.addEventListener('open', () => {
      stopConnectionTimers();
      const accessToken = getSupabaseAccessToken() || anonKey || '';
      socket?.send(JSON.stringify({ topic: 'realtime:public:layouts', event: 'phx_join', payload: { config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: [{ event: '*', schema: 'public', table: 'layouts' }] }, access_token: accessToken }, ref: '1' }));
      heartbeat = window.setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(Date.now()) })), 25000);
      fallbackDelay = window.setTimeout(() => { if (!joined) startPolling(); }, 5000);
    });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { event?: string; payload?: { status?: string } };
        if (message.event === 'phx_reply' && message.payload?.status === 'ok') { joined = true; reconnectAttempts = 0; stopPolling(); if (fallbackDelay !== null) window.clearTimeout(fallbackDelay); }
        if (message.event === 'postgres_changes') onChange();
      } catch { /* ignore malformed realtime frames */ }
    });
    socket.addEventListener('close', () => { stopConnectionTimers(); if (disposed) return; joined = false; startPolling(); reconnectAttempts += 1; reconnect = window.setTimeout(connect, Math.min(30000, 1000 * 2 ** reconnectAttempts)); });
    socket.addEventListener('error', startPolling);
  } catch { socket = null; startPolling(); } };
  connect();
  return () => {
    disposed = true;
    stopConnectionTimers();
    if (poll !== null) window.clearInterval(poll);
    if (reconnect !== null) window.clearTimeout(reconnect);
    socket?.close();
  };
}
