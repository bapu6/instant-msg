import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { query } from '../db';

interface ClientConnection {
  ws: WebSocket;
  username: string;
}

class SignalingService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<WebSocket>> = new Map();
  private groupRooms: Map<number, Set<string>> = new Map();

  public init(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws/signaling' });

    this.wss.on('connection', (ws: WebSocket) => {
      let registeredUser: string | null = null;

      ws.on('message', async (data: string) => {
        try {
          const payload = JSON.parse(data.toString());
          const { type } = payload;

          switch (type) {
            // 1. User Registration on connect & Presence announcement
            case 'register': {
              const username = payload.username?.toLowerCase();
              if (username) {
                registeredUser = username;
                if (!this.clients.has(username)) {
                  this.clients.set(username, new Set());
                }
                this.clients.get(username)!.add(ws);

                // Update last_seen in DB
                query('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE username = $1', [username]).catch(() => {});

                // Mark pending undelivered messages as delivered
                try {
                  const messageService = require('./messageService').default;
                  messageService.markMessagesDelivered(username).catch(() => {});
                } catch {}

                // Check privacy status (hide_presence)
                try {
                  const uRes = await query('SELECT hide_presence FROM users WHERE username = $1', [username]);
                  const hidePresence = uRes.rows[0]?.hide_presence;
                  if (!hidePresence) {
                    this.broadcastPresence(username, true, new Date().toISOString());
                  }
                } catch {}

                console.log(`[Signaling] Registered user "${username}" (active connections: ${this.clients.get(username)!.size})`);
              }
              break;
            }

            // 1b. XEP Presence Stanza (available / unavailable / invisible)
            case 'presence': {
              const username = (registeredUser || payload.username)?.toLowerCase();
              const status = payload.status; // 'available' | 'unavailable' | 'invisible'
              if (username) {
                if (status === 'invisible' || status === 'unavailable') {
                  this.broadcastPresence(username, false, new Date().toISOString());
                } else {
                  this.broadcastPresence(username, true, new Date().toISOString());
                }
              }
              break;
            }

            // 2. WebRTC Call: Initiate Call
            case 'call-user': {
              const { to, from, isVideo, offer, callerName, callerAvatar } = payload;
              if (to && from) {
                try {
                  const contactService = require('./contactService').default;
                  const isBlocked = await contactService.isUserBlocked(to, from);
                  if (isBlocked) {
                    this.sendToUser(from, { type: 'call-rejected', reason: 'blocked', from: to });
                    break;
                  }
                } catch {}
              }
              this.sendToUser(to, {
                type: 'incoming-call',
                from,
                to,
                isVideo: Boolean(isVideo),
                offer,
                callerName,
                callerAvatar,
              });
              break;
            }

            // 3. WebRTC Call: Accept Call
            case 'call-accepted': {
              const { to, from, answer } = payload;
              this.sendToUser(to, {
                type: 'call-accepted',
                from,
                answer,
              });
              break;
            }

            // 4. WebRTC Call: ICE Candidate Exchange
            case 'ice-candidate': {
              const { to, candidate, from } = payload;
              this.sendToUser(to, {
                type: 'ice-candidate',
                from,
                candidate,
              });
              break;
            }

            // 5. WebRTC Call: End / Hangup Call
            case 'end-call': {
              const { to, from } = payload;
              this.sendToUser(to, {
                type: 'call-ended',
                from,
              });
              break;
            }

            // 6. WebRTC Call: Reject / Decline Call
            case 'reject-call': {
              const { to, from } = payload;
              this.sendToUser(to, {
                type: 'call-rejected',
                from,
              });
              break;
            }

            // 7. Group Real-Time Broadcast
            case 'group-message': {
              const { groupId, message, memberUsernames } = payload;
              if (Array.isArray(memberUsernames)) {
                for (const member of memberUsernames) {
                  this.sendToUser(member, {
                    type: 'new-group-message',
                    groupId,
                    message,
                  });
                }
              }
              break;
            }

            // 8. Read Receipt
            case 'mark-read': {
              const { reader, sender } = payload;
              if (reader && sender) {
                try {
                  const messageService = require('./messageService').default;
                  messageService.markMessagesRead(reader, sender).catch(() => {});
                } catch {}
              }
              break;
            }

            default:
              break;
          }
        } catch (err: any) {
          console.error('[Signaling] Message parse error:', err.message);
        }
      });

      ws.on('close', async () => {
        if (registeredUser && this.clients.has(registeredUser)) {
          const userSockets = this.clients.get(registeredUser)!;
          userSockets.delete(ws);
          if (userSockets.size === 0) {
            this.clients.delete(registeredUser);
            const now = new Date().toISOString();
            // Update last_seen in DB
            query('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE username = $1', [registeredUser]).catch(() => {});

            // Broadcast offline if not hidden
            try {
              const uRes = await query('SELECT hide_presence FROM users WHERE username = $1', [registeredUser]);
              if (!uRes.rows[0]?.hide_presence) {
                this.broadcastPresence(registeredUser, false, now);
              }
            } catch {}
          }
          console.log(`[Signaling] Disconnected user "${registeredUser}"`);
        }
      });
    });

    console.log('[Signaling] WebRTC Signaling WebSocket server mounted at /ws/signaling');
  }

  public isUserOnline(username: string): boolean {
    if (!username) return false;
    const sockets = this.clients.get(username.toLowerCase());
    return Boolean(sockets && sockets.size > 0);
  }

  public broadcastPresence(username: string, isOnline: boolean, lastSeen: string | null) {
    this.broadcastToAll({
      type: 'presence-update',
      username: username.toLowerCase(),
      isOnline,
      lastSeen,
    });
  }

  public broadcastToAll(data: any) {
    const messageStr = JSON.stringify(data);
    for (const sockets of this.clients.values()) {
      for (const socket of sockets) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(messageStr);
        }
      }
    }
  }

  public sendToUser(username: string, data: any) {
    if (!username) return;
    const targetUser = username.toLowerCase();
    const sockets = this.clients.get(targetUser);
    if (sockets && sockets.size > 0) {
      const messageStr = JSON.stringify(data);
      for (const socket of sockets) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(messageStr);
        }
      }
    }
  }

  public broadcastGroupMessage(memberUsernames: string[], data: any) {
    for (const username of memberUsernames) {
      this.sendToUser(username, data);
    }
  }
}

export default new SignalingService();
