(function () {
  'use strict';

  class LayoutsAPI {
    constructor(config) {
      this.config = config || {};
      this.configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(this.config.url || '') && !/YOUR_|PUBLIC_ANON/i.test(this.config.anonKey || '');
      this.client = this.configured && window.supabase ? window.supabase.createClient(this.config.url, this.config.anonKey, { auth: { persistSession: false } }) : null;
    }

    ensureConfigured() {
      if (!this.client) throw new Error('SUPABASE_NOT_CONFIGURED');
    }

    validate(input) {
      if (!input?.name?.trim()) throw new Error('LAYOUT_NAME_REQUIRED');
      if (!input?.author_name?.trim()) throw new Error('AUTHOR_NAME_REQUIRED');
      const data = input.layout_data;
      if (!data || !data.room || !Array.isArray(data.furniture) || !data.version) throw new Error('INVALID_LAYOUT_DATA');
      return true;
    }

    async list() {
      this.ensureConfigured();
      const { data, error } = await this.client.from('layouts').select('id,name,author_name,description,thumbnail,created_at,updated_at,version').eq('is_archived', false).order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }

    async get(id) {
      this.ensureConfigured();
      const { data, error } = await this.client.from('layouts').select('*').eq('id', id).eq('is_archived', false).single();
      if (error) throw error;
      return data;
    }

    async create(input) {
      this.ensureConfigured(); this.validate(input);
      const payload = { name: input.name.trim(), author_name: input.author_name.trim(), description: (input.description || '').trim(), layout_data: input.layout_data, thumbnail: input.thumbnail || null, version: 1, is_archived: false };
      const { data, error } = await this.client.from('layouts').insert(payload).select().single();
      if (error) throw error;
      return data;
    }

    async update(id, expectedVersion, input) {
      this.ensureConfigured(); this.validate(input);
      const payload = { name: input.name.trim(), author_name: input.author_name.trim(), description: (input.description || '').trim(), layout_data: input.layout_data, thumbnail: input.thumbnail || null, version: expectedVersion + 1, updated_at: new Date().toISOString() };
      const { data, error } = await this.client.from('layouts').update(payload).eq('id', id).eq('version', expectedVersion).eq('is_archived', false).select();
      if (error) throw error;
      if (!data?.length) { const conflict = new Error('LAYOUT_VERSION_CONFLICT'); conflict.code = 'LAYOUT_VERSION_CONFLICT'; throw conflict; }
      return data[0];
    }

    async rename(id, expectedVersion, name) {
      this.ensureConfigured();
      const { data, error } = await this.client.from('layouts').update({ name: name.trim(), version: expectedVersion + 1, updated_at: new Date().toISOString() }).eq('id', id).eq('version', expectedVersion).eq('is_archived', false).select();
      if (error) throw error;
      if (!data?.length) throw new Error('LAYOUT_VERSION_CONFLICT');
      return data[0];
    }

    async archive(id, expectedVersion) {
      this.ensureConfigured();
      const { data, error } = await this.client.rpc('archive_layout', { layout_id: id, expected_version: expectedVersion });
      if (error) throw error;
      if (!data) throw new Error('LAYOUT_VERSION_CONFLICT');
      return true;
    }

    subscribe(onChange) {
      if (!this.client) return null;
      return this.client.channel('aiad-layouts-list').on('postgres_changes', { event: '*', schema: 'public', table: 'layouts' }, onChange).subscribe();
    }
  }

  window.AIADLayoutsAPI = LayoutsAPI;
})();
