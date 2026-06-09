import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store.js';
import { Spark } from '../ui.js';

export function Chat() {
  const { chat, send, active, busy } = useStore();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat, busy]);

  const submit = async () => {
    const t = text.trim();
    if (!t || !active) return;
    setText('');
    await send(t);
  };

  return (
    <section className="chat">
      <div className="pane-head">
        <span className="h-title">{active ? active.name : 'Chat'}</span>
        {active && <span className="h-sub">claude code · local</span>}
      </div>

      <div className="messages">
        {!active && (
          <div className="empty-chat">
            <div className="spark"><Spark size={24} /></div>
            <div className="big">Pick a repo, then just ask.</div>
            <div>
              Try <code>build me a landing page with a hero and a waitlist form</code> —
              Claude edits the repo, commits, and you watch it happen.
            </div>
          </div>
        )}

        {active && chat.length === 0 && !busy && (
          <div className="empty-chat">
            <div className="spark"><Spark size={24} /></div>
            <div className="big">What are we building?</div>
            <div>Describe a change and Claude gets to work — then auto-commits when it's done.</div>
          </div>
        )}

        {chat.map((m, i) => {
          if (m.role === 'system') {
            return <div key={i} className={`notice ${m.level ?? 'info'}`}>{m.text}</div>;
          }
          if (m.role === 'assistant' && m.text.startsWith('🔧 ')) {
            return (
              <div key={i} className="tool-chip">
                <span className="g">🔧</span>{m.text.slice(2)}
              </div>
            );
          }
          if (m.role === 'user') {
            return (
              <div key={i} className="row user">
                <div className="who me">YOU</div>
                <div className="bubble">{m.text}</div>
              </div>
            );
          }
          return (
            <div key={i} className="row assistant">
              <div className="who ai"><Spark size={15} /></div>
              <div className="bubble">{m.text}</div>
            </div>
          );
        })}

        {busy && (
          <div className="thinking">
            <div className="who ai"><Spark size={15} /></div>
            <div className="bubble">
              Claude is cooking
              <span className="dots"><i /><i /><i /></span>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="composer">
        <input
          className="input"
          placeholder={active ? 'Ask Claude to build something…' : 'Select a repo to start'}
          value={text}
          disabled={!active}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="btn send" onClick={submit} disabled={!active} aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12h13M11 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}
