import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ClaudeEvent, PreviewStatus, WsServerMessage } from '@claudable/shared/types.js';
import { api, type ProjectView } from './api.js';
import { useProjectStream } from './useProjectStream.js';

export interface ChatMessage { role: 'user' | 'assistant'; text: string }
export interface TerminalLine { source: string; line: string }

interface StoreState {
  projects: ProjectView[];
  activeId: string | null;
  active: ProjectView | null;
  chat: ChatMessage[];
  terminal: TerminalLine[];
  preview: PreviewStatus;
  refresh: () => Promise<void>;
  select: (id: string) => void;
  send: (prompt: string) => Promise<void>;
}

const Ctx = createContext<StoreState | null>(null);
export const useStore = () => { const c = useContext(Ctx); if (!c) throw new Error('no store'); return c; };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [terminal, setTerminal] = useState<TerminalLine[]>([]);
  const [preview, setPreview] = useState<PreviewStatus>({ running: false });

  const refresh = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    setActiveId((cur) => cur ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const active = projects.find((p) => p.id === activeId) ?? null;
  useEffect(() => { setPreview(active?.preview ?? { running: false }); }, [activeId, projects]);

  const select = useCallback((id: string) => {
    setActiveId(id); setChat([]); setTerminal([]);
  }, []);

  const handleMessage = useCallback((msg: WsServerMessage) => {
    if (msg.projectId !== activeId) return; // ignore stale messages from a previous project
    if (msg.channel === 'claude') {
      const ev: ClaudeEvent = msg.event;
      if (ev.type === 'assistant') setChat((c) => [...c, { role: 'assistant', text: ev.text }]);
      else if (ev.type === 'tool_use') setChat((c) => [...c, { role: 'assistant', text: `🔧 ${ev.name}` }]);
      else if (ev.type === 'error') setChat((c) => [...c, { role: 'assistant', text: `⚠️ ${ev.message}` }]);
    } else if (msg.channel === 'terminal') {
      setTerminal((t) => [...t, { source: msg.source, line: msg.line }]);
    } else if (msg.channel === 'preview') {
      setPreview(msg.status);
    }
  }, [activeId]);

  useProjectStream(activeId, handleMessage);

  const send = useCallback(async (prompt: string) => {
    if (!activeId) return;
    setChat((c) => [...c, { role: 'user', text: prompt }]);
    await api.sendMessage(activeId, prompt);
  }, [activeId]);

  return (
    <Ctx.Provider value={{ projects, activeId, active, chat, terminal, preview, refresh, select, send }}>
      {children}
    </Ctx.Provider>
  );
}
