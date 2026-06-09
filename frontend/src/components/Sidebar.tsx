import React, { useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';

export function Sidebar() {
  const { projects, activeId, active, select, refresh } = useStore();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const v = value.trim();
    if (!v) return;
    setError(null);
    const body = v.startsWith('http') || v.endsWith('.git') ? { gitUrl: v } : { path: v };
    try {
      await api.addProject(body);
      setValue(''); setAdding(false);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const connectSupabase = async () => {
    if (!activeId) return;
    await api.connectSupabase(activeId);
    await refresh();
  };

  return (
    <aside className="sidebar">
      <h1><span>Claudable</span></h1>
      {projects.map((p) => (
        <div key={p.id} className={`project ${p.id === activeId ? 'active' : ''}`} onClick={() => select(p.id)}>
          {p.name}
          {p.supabaseConnected && <div className="badge">supabase ✓</div>}
        </div>
      ))}
      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input className="input" autoFocus placeholder="local path or GitHub URL"
            value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn" onClick={add}>Add</button>
          {error && <div style={{ color: 'var(--accent)', fontSize: 12 }}>{error}</div>}
        </div>
      ) : (
        <button className="btn secondary" onClick={() => setAdding(true)}>+ Add repo</button>
      )}
      <div style={{ flex: 1 }} />
      {active && (
        <button className="btn secondary" onClick={connectSupabase}>
          {active.supabaseConnected ? 'Supabase connected ✓' : 'Connect Supabase'}
        </button>
      )}
    </aside>
  );
}
