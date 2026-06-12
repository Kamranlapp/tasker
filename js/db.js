// ── Supabase Config & Client ───────────────────────────────────
const SUPABASE_URL = 'https://pxodatramesmgggjsyyi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4b2RhdHJhbWVzbWdnZ2pzeXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4OTY1OTYsImV4cCI6MjA5MTQ3MjU5Nn0.QNPV1qW-GpoxPLtnT-PVNunQXxKvAEs35pY0vP5Kkjg';

const supabaseGlobal = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
const supabaseAuth = supabaseGlobal
  ? supabaseGlobal.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    })
  : null;

async function authHeaders() {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
  if (!supabaseAuth) return headers;
  const { data } = await supabaseAuth.auth.getSession();
  const token = data?.session?.access_token;
  if (token) headers.Authorization = 'Bearer ' + token;
  return headers;
}

const sb = {
  async query(table, method = 'GET', body = null, params = '') {
    const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
    const opts = {
      method,
      headers: {
        ...(await authHeaders()),
        'Prefer': 'return=representation'
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (!r.ok) {
      const e = await r.text();
      throw new Error(e);
    }
    if (r.status === 204) return [];
    const t = await r.text();
    return t ? JSON.parse(t) : [];
  },
  get(table, params = '') { return this.query(table, 'GET', null, params); },
  post(table, body) { return this.query(table, 'POST', body); },
  patch(table, params, body) { return this.query(table, 'PATCH', body, params); },
  async upsert(table, body) {
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        ...(await authHeaders()),
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const e = await r.text();
      throw new Error(`Upsert ${table} failed (${r.status}): ${e}`);
    }
    if (r.status === 204) return [];
    const t = await r.text();
    return t ? JSON.parse(t) : [];
  }
};
