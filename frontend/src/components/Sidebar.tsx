import React, { useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Spark, avatarColor, initials } from '../ui.js';

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
      setValue('');
      setAdding(false);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const connectSupabase = async () => {
    if (!activeId) return;
    try { await api.connectSupabase(activeId); await refresh(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        {/* Logo placeholder — replace with your Claude × Lovable mark */}
        <div className="mark"><Spark size={22} /></div>
        <div>
          <div className="word">Claud<b>able</b><span className="heart">🧡</span></div>
          <div className="tag">Lovable, but it's just Claude. Locally.</div>
        </div>
      </div>

      <div className="side-label">Repositories</div>
      <div className="projects">
        {projects.length === 0 && !adding && (
          <div className="tag" style={{ padding: '4px 8px' }}>
            No repos yet — Claude's twiddling its thumbs.
          </div>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
            className={`project ${p.id === activeId ? 'active' : ''}`}
            onClick={() => select(p.id)}
          >
            <div className="avatar" style={{ background: avatarColor(p.name) }}>{initials(p.name)}</div>
            <div className="meta">
              <div className="name">{p.name}</div>
              <div className="sub">
                {p.supabaseConnected
                  ? <span className="dot-supa">supabase&nbsp;✓</span>
                  : <span>{p.preview.running ? 'live preview' : 'idle'}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="add-form">
          <input
            className="input"
            autoFocus
            placeholder="local path or GitHub URL"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
              if (e.key === 'Escape') { setAdding(false); setError(null); }
            }}
          />
          {error && <div className="err-text">{error}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" style={{ flex: 1 }} onClick={add}>Add repo</button>
            <button className="btn ghost" onClick={() => { setAdding(false); setError(null); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="add-repo" onClick={() => setAdding(true)}>
          <Spark size={13} /> Add a repo
        </button>
      )}

      <div className="side-foot">
        {active && (
          <button className="btn secondary supabtn" onClick={connectSupabase}>
            {active.supabaseConnected ? '🟢 Supabase connected' : '⚡ Connect Supabase'}
          </button>
        )}
        <div className="quip">
          Powered by your local <b>Claude Code</b>. Made with 🧡, not 💜.
        </div>
      </div>
    </aside>
  );
}
