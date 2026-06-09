import React, { useState, useEffect } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Spark } from '../ui.js';

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
      <div className="browser">
        <div className="chrome">
          <div className="lights"><i /><i /><i /></div>
          <div className="urlbar">
            <span className="lock">🔒</span>
            <span className="u">{preview.starting ? 'starting dev server…' : (preview.url ?? 'about:blank')}</span>
          </div>
          <div className="acts">
            {preview.running
              ? <button className="btn ghost" onClick={stop}>Stop</button>
              : <button className="btn ghost" onClick={start} disabled={!active}>Run</button>}
            <button className="btn ghost" onClick={() => setNonce((n) => n + 1)} disabled={!ready}>↻</button>
          </div>
        </div>

        {ready ? (
          <iframe key={nonce} src={preview.url} title="Live preview" />
        ) : (
          <div className="stage">
            <div className="card">
              {preview.starting ? (
                <>
                  <div className="boot-spark"><Spark size={24} /></div>
                  <div className="big">Booting the dev server…</div>
                  <div>Hang tight — loading your app the moment it's ready.</div>
                </>
              ) : error ? (
                <>
                  <div className="big err">Couldn't start the preview</div>
                  <div>{error}</div>
                </>
              ) : (
                <>
                  <div className="big">No preview running</div>
                  <div>Hit <b>Run</b> to boot this repo's dev server and see it live.</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
