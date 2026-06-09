import React, { useState, useEffect } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';

export function Preview() {
  const { active, preview } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0); // force iframe reload

  useEffect(() => { setError(null); }, [active?.id]);
  // Auto-reload the iframe once the dev server finishes booting.
  useEffect(() => {
    if (preview.running && !preview.starting) setNonce((n) => n + 1);
  }, [preview.running, preview.starting]);

  const start = async () => {
    if (!active) return;
    setError(null);
    try { await api.startPreview(active.id); } catch (e: any) { setError(e.message); }
  };
  const stop = async () => { if (active) await api.stopPreview(active.id); };

  const ready = preview.running && !preview.starting && !!preview.url;
  return (
    <section className="preview">
      <div className="bar">
        {preview.running
          ? <button className="btn secondary" onClick={stop}>Stop</button>
          : <button className="btn secondary" onClick={start} disabled={!active}>Run</button>}
        <button className="btn secondary" onClick={() => setNonce((n) => n + 1)} disabled={!ready}>Reload</button>
        <span style={{ color: 'var(--muted)' }}>
          {preview.starting ? 'starting…' : (preview.url ?? 'preview not running')}
        </span>
      </div>
      {ready
        ? <iframe key={nonce} src={preview.url} title="preview" />
        : <div className="empty">
            {error ?? (preview.starting ? 'Booting dev server…' : 'Run the app to see a live preview')}
          </div>}
    </section>
  );
}
