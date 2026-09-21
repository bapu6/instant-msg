import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

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

      ws.on('message', (data: string) => {
        try {
          const payload = JSON.parse(data.toString());
          const { type } = payload;

          switch (type) {
            // 1. User Registration on connect
            case 'register': {
              const username = payload.username?.toLowerCase();
              if (username) {
                registeredUser = username;
                if (!this.clients.has(username)) {
                  this.clients.set(username, new Set());
                }
                this.clients.get(username)!.add(ws);
                console.log(`[Signaling] Registered user "${username}" (active connections: ${this.clients.get(username)!.size})`);
              }
              break;
            }

            // 2. WebRTC Call: Initiate Call
            case 'call-user': {
              const { to, from, isVideo, offer, callerName, callerAvatar } = payload;
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

            default:
              break;
          }
        } catch (err: any) {
          console.error('[Signaling] Message parse error:', err.message);
        }
      });

      ws.on('close', () => {
        if (registeredUser && this.clients.has(registeredUser)) {
          const userSockets = this.clients.get(registeredUser)!;
          userSockets.delete(ws);
          if (userSockets.size === 0) {
            this.clients.delete(registeredUser);
          }
          console.log(`[Signaling] Disconnected user "${registeredUser}"`);
        }
      });
    });

    console.log('[Signaling] WebRTC Signaling WebSocket server mounted at /ws/signaling');
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
