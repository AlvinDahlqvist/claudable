import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { WsServerMessage, WsClientMessage } from '@claudable/shared/types.js';

/** Tracks which projectIds each socket is subscribed to and fans out messages. */
export class WsHub {
  private wss: WebSocketServer;
  private subs = new Map<WebSocket, Set<string>>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (socket) => {
      this.subs.set(socket, new Set());
      socket.on('error', (err) => console.error('[wsHub] socket error:', err));
      socket.on('message', (raw) => {
        let msg: WsClientMessage;
        try { msg = JSON.parse(String(raw)); } catch { return; }
        const set = this.subs.get(socket)!;
        if (msg.type === 'subscribe') set.add(msg.projectId);
        else if (msg.type === 'unsubscribe') set.delete(msg.projectId);
      });
      socket.on('close', () => this.subs.delete(socket));
    });
  }

  /** Send a message to every socket subscribed to its projectId. */
  broadcast(message: WsServerMessage): void {
    const data = JSON.stringify(message);
    for (const [socket, set] of this.subs) {
      if (set.has(message.projectId) && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    }
  }
}
