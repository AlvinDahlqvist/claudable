import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { Chat } from './components/Chat.js';
import { Preview } from './components/Preview.js';
import { Terminal } from './components/Terminal.js';

export function App() {
  const [terminalOpen, setTerminalOpen] = useState(true);
  return (
    <div className="app">
      <Sidebar />
      <div className="center">
        <div className="workspace">
          <Chat />
          <Preview />
        </div>
        <Terminal open={terminalOpen} onToggle={() => setTerminalOpen((v) => !v)} />
      </div>
    </div>
  );
}
