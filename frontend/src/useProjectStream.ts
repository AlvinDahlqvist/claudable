import { useEffect, useRef } from 'react';
import type { WsServerMessage } from '@claudable/shared/types.js';

/** Subscribe to a project's live stream; calls onMessage for each event. Auto-reconnects. */
export function useProjectStream(projectId: string | null, onMessage: (msg: WsServerMessage) => void) {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!projectId) return;
    let socket: WebSocket;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${proto}://${location.host}/ws`);
      socket.onopen = () => socket.send(JSON.stringify({ type: 'subscribe', projectId }));
      socket.onmessage = (e) => cbRef.current(JSON.parse(e.data) as WsServerMessage);
      socket.onclose = () => { if (!closed) retry = setTimeout(connect, 1000); };
    };
    connect();

    return () => { closed = true; clearTimeout(retry); socket?.close(); };
  }, [projectId]);
}
