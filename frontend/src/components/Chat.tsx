import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store.js';

export function Chat() {
  const { chat, send, active } = useStore();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  const submit = async () => {
    const t = text.trim();
    if (!t || !active) return;
    setText('');
    await send(t);
  };

  return (
    <section className="chat">
      <div className="messages">
        {!active && <div className="msg assistant">Add a repo to start building.</div>}
        {chat.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}
        <div ref={endRef} />
      </div>
      <div className="composer">
        <input className="input" placeholder={active ? 'Ask Claude to build something…' : 'Select a project'}
          value={text} disabled={!active}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button className="btn" onClick={submit} disabled={!active}>Send</button>
      </div>
    </section>
  );
}
