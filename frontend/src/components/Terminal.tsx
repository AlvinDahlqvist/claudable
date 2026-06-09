import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useStore } from '../store.js';

const TABS = ['claude', 'preview', 'git'] as const;
type Tab = (typeof TABS)[number];

export function Terminal({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { terminal } = useStore();
  const [tab, setTab] = useState<Tab>('claude');
  const endRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => terminal.filter((l) => l.source === tab), [terminal, tab]);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [lines, open]);

  return (
    <div className={`terminal ${open ? '' : 'closed'}`}>
      <div className="tabs">
        {TABS.map((t) => (
          <div key={t} className={`tab ${t === tab ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="tab" onClick={onToggle}>{open ? '▾' : '▸'}</div>
      </div>
      <div className="lines">
        {lines.map((l, i) => <div key={i} className={`line ${l.source}`}>{l.line}</div>)}
        <div ref={endRef} />
      </div>
    </div>
  );
}
