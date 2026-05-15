import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  ChatMessage,
  ChatUser,
  ChatRoom,
  ChatRoomState,
  ChatRoomSettings,
  ChatEvent,
} from '../models/ChatMessage';
import { authService } from './AuthService';
import { UserRole } from '../models/User';

// Identity established on `register`. Derived from the JWT when provided;
// otherwise an anonymous viewer with no special roles.
interface SocketContext {
  userId: string;
  username: string;
  displayName: string;
  roles: string[]; // chat-level roles, derived from JWT role
  isAuthenticated: boolean;
}

function rolesFromJwtRole(role: UserRole): string[] {
  switch (role) {
    case UserRole.ADMIN:
      return ['viewer', 'moderator', 'admin'];
    case UserRole.STREAMER:
      return ['viewer', 'broadcaster'];
    case UserRole.VIEWER:
    default:
      return ['viewer'];
  }
}

export class ChatService {
  private io: SocketIOServer;
  private chatRooms: Map<string, ChatRoomState> = new Map();
  private messageHistory: Map<string, ChatMessage[]> = new Map();
  private contextBySocket: Map<string, SocketContext> = new Map();
  private socketByUser: Map<string, Socket> = new Map();

  private bannedWords: string[] = ['inappropriate1', 'inappropriate2', 'inappropriate3'];

  private defaultRoomSettings: ChatRoomSettings = {
    slowMode: false,
    slowModeInterval: 3,
    subscriberOnly: false,
    followerOnly: false,
    followerTimeRequired: 0,
    emoteOnly: false,
    filteredWords: [],
  };

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
    });
    this.setupSocketHandlers();
    console.log('[ChatService] Initialized');
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[ChatService] Client connected: ${socket.id}`);

      socket.on('register', (data: { token?: string }) => {
        try {
          let ctx: SocketContext;

          if (data?.token) {
            const session = authService.verifyToken(data.token);
            if (!session) {
              socket.emit('error', { message: 'Invalid or expired token' });
              return;
            }
            ctx = {
              userId: session.userId,
              username: session.username,
              displayName: session.username,
              roles: rolesFromJwtRole(session.role),
              isAuthenticated: true,
            };
          } else {
            // Anonymous viewer — auto-generated identity, no privileged roles.
            const anonId = uuidv4();
            ctx = {
              userId: anonId,
              username: `anon-${anonId.slice(0, 6)}`,
              displayName: `anon-${anonId.slice(0, 6)}`,
              roles: ['viewer'],
              isAuthenticated: false,
            };
          }

          this.contextBySocket.set(socket.id, ctx);
          this.socketByUser.set(ctx.userId, socket);

          socket.emit('registered', {
            userId: ctx.userId,
            username: ctx.username,
            displayName: ctx.displayName,
            isAuthenticated: ctx.isAuthenticated,
            roles: ctx.roles,
          });

          console.log(
            `[ChatService] Registered ${ctx.isAuthenticated ? 'authed' : 'anon'}: ${ctx.username} (${ctx.userId})`
          );
        } catch (error) {
          console.error('[ChatService] Error during registration:', error);
          socket.emit('error', { message: 'Registration failed' });
        }
      });

      socket.on(
        'join-room',
        (data: { roomId: string; streamKey?: string }) => {
          try {
            const { roomId, streamKey } = data;
            const ctx = this.contextBySocket.get(socket.id);
            if (!ctx) {
              socket.emit('error', { message: 'You must register first' });
              return;
            }

            let targetRoomId = roomId;
            if (streamKey) {
              const existingRoomId = this.findRoomByStreamKey(streamKey);
              if (existingRoomId) {
                targetRoomId = existingRoomId;
              } else {
                const newRoom = this.createRoom(
                  `stream_${streamKey}`,
                  `Stream Chat: ${streamKey}`,
                  streamKey
                );
                targetRoomId = newRoom.room.id;
              }
            }

            const chatUser: ChatUser = {
              id: ctx.userId,
              username: ctx.username,
              displayName: ctx.displayName,
              roles: ctx.roles,
              joinedAt: new Date(),
              isBanned: false,
              isMuted: false,
              color: this.getRandomColor(),
            };

            let roomState = this.chatRooms.get(targetRoomId);
            if (!roomState) {
              roomState = this.createRoom(
                targetRoomId,
                `Chat Room ${targetRoomId}`,
                streamKey || targetRoomId
              );
            }

            roomState.users[ctx.userId] = chatUser;
            roomState.userCount = Object.keys(roomState.users).length;
            roomState.lastActivity = new Date();
            socket.join(targetRoomId);

            const recentMessages = this.messageHistory.get(targetRoomId)?.slice(-50) || [];

            socket.emit('room-joined', {
              roomId: targetRoomId,
              user: chatUser,
              recentMessages,
              userCount: roomState.userCount,
            });

            this.broadcastToRoom(targetRoomId, {
              type: 'user-joined',
              data: {
                user: {
                  id: chatUser.id,
                  username: chatUser.username,
                  displayName: chatUser.displayName,
                  color: chatUser.color,
                },
              },
            });

            this.addSystemMessage(targetRoomId, `${chatUser.displayName} joined the chat`);
            console.log(
              `[ChatService] ${chatUser.username} joined ${targetRoomId}. Total users: ${roomState.userCount}`
            );
          } catch (error) {
            console.error('[ChatService] Error joining room:', error);
            socket.emit('error', { message: 'Failed to join chat room' });
          }
        }
      );

      socket.on(
        'send-message',
        (data: { roomId: string; message: string; replyToId?: string }) => {
          try {
            const { roomId, message, replyToId } = data;
            const ctx = this.contextBySocket.get(socket.id);
            if (!ctx) {
              socket.emit('error', { message: 'You must register first' });
              return;
            }

            const roomState = this.chatRooms.get(roomId);
            if (!roomState) {
              socket.emit('error', { message: 'Room not found' });
              return;
            }

            const user = roomState.users[ctx.userId];
            if (!user) {
              socket.emit('error', { message: 'You are not in this room' });
              return;
            }

            if (user.isBanned) {
              socket.emit('error', { message: 'You are banned from this chat' });
              return;
            }

            if (user.isMuted) {
              if (!user.muteExpiry || user.muteExpiry > new Date()) {
                socket.emit('error', { message: 'You are muted in this chat' });
                return;
              } else {
                user.isMuted = false;
                user.muteExpiry = undefined;
              }
            }

            if (roomState.room.settings.slowMode && !this.hasModeratorPermission(user)) {
              const userMessages =
                this.messageHistory.get(roomId)?.filter(
                  (msg) => msg.userId === ctx.userId && msg.type === 'message'
                ) || [];
              const lastMessage =
                userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
              if (lastMessage) {
                const secondsSinceLast =
                  (Date.now() - lastMessage.timestamp.getTime()) / 1000;
                if (secondsSinceLast < roomState.room.settings.slowModeInterval) {
                  const waitTime = Math.ceil(
                    roomState.room.settings.slowModeInterval - secondsSinceLast
                  );
                  socket.emit('error', {
                    message: `Slow mode is enabled. Please wait ${waitTime} seconds.`,
                  });
                  return;
                }
              }
            }

            if (
              roomState.room.settings.subscriberOnly &&
              !user.roles.includes('subscriber') &&
              !this.hasModeratorPermission(user)
            ) {
              socket.emit('error', { message: 'This chat is in subscriber-only mode' });
              return;
            }

            const moderatedMessage = this.moderateMessage(
              message,
              roomState.room.settings.filteredWords
            );
            const isModerated = moderatedMessage !== message;

            const chatMessage: ChatMessage = {
              id: uuidv4(),
              roomId,
              userId: ctx.userId,
              username: user.username,
              message: moderatedMessage,
              timestamp: new Date(),
              type: 'message',
              replyToId,
              isModerated,
              moderationReason: isModerated ? 'Contained filtered words' : undefined,
            };

            this.addMessageToHistory(roomId, chatMessage);
            roomState.lastActivity = new Date();
            this.broadcastToRoom(roomId, { type: 'new-message', data: chatMessage });
          } catch (error) {
            console.error('[ChatService] Error sending message:', error);
            socket.emit('error', { message: 'Failed to send message' });
          }
        }
      );

      socket.on(
        'moderate',
        (data: {
          roomId: string;
          action: 'delete' | 'ban' | 'timeout' | 'unmute';
          targetId: string;
          messageId?: string;
          duration?: number;
          reason?: string;
        }) => {
          try {
            const { roomId, action, targetId, messageId, duration, reason } = data;
            const ctx = this.contextBySocket.get(socket.id);
            if (!ctx) {
              socket.emit('error', { message: 'You must register first' });
              return;
            }

            const roomState = this.chatRooms.get(roomId);
            if (!roomState) {
              socket.emit('error', { message: 'Room not found' });
              return;
            }

            const moderator = roomState.users[ctx.userId];
            if (!moderator) {
              socket.emit('error', { message: 'You are not in this room' });
              return;
            }

            // CRITICAL: moderation requires real auth + role from JWT, not
            // the client-supplied roles that the old code accepted.
            if (!ctx.isAuthenticated || !this.hasModeratorPermission(moderator)) {
              socket.emit('error', { message: 'You do not have permission to moderate' });
              return;
            }

            switch (action) {
              case 'delete': {
                if (!messageId) {
                  socket.emit('error', { message: 'Message ID is required' });
                  return;
                }
                const messages = this.messageHistory.get(roomId) || [];
                const idx = messages.findIndex((m) => m.id === messageId);
                if (idx === -1) {
                  socket.emit('error', { message: 'Message not found' });
                  return;
                }
                messages[idx].isModerated = true;
                messages[idx].message = '[Message removed by moderator]';
                messages[idx].moderationReason = reason || 'Removed by moderator';
                this.broadcastToRoom(roomId, {
                  type: 'message-moderated',
                  data: { messageId, action: 'delete', moderatorId: ctx.userId },
                });
                break;
              }
              case 'ban': {
                const banUser = roomState.users[targetId];
                if (!banUser) {
                  socket.emit('error', { message: 'User not found' });
                  return;
                }
                banUser.isBanned = true;
                const banSocket = this.socketByUser.get(targetId);
                if (banSocket) {
                  banSocket.emit('moderation', {
                    action: 'ban',
                    reason: reason || 'Banned by moderator',
                    moderatorId: ctx.userId,
                  });
                  banSocket.leave(roomId);
                  delete roomState.users[targetId];
                  roomState.userCount = Object.keys(roomState.users).length;
                }
                this.addSystemMessage(roomId, `${banUser.displayName} has been banned`);
                this.broadcastToRoom(roomId, {
                  type: 'user-banned',
                  data: { userId: targetId, moderatorId: ctx.userId },
                });
                break;
              }
              case 'timeout': {
                const tUser = roomState.users[targetId];
                if (!tUser) {
                  socket.emit('error', { message: 'User not found' });
                  return;
                }
                const timeoutDuration = duration || 300;
                tUser.isMuted = true;
                tUser.muteExpiry = new Date(Date.now() + timeoutDuration * 1000);
                const tSocket = this.socketByUser.get(targetId);
                if (tSocket) {
                  tSocket.emit('moderation', {
                    action: 'timeout',
                    duration: timeoutDuration,
                    reason: reason || 'Timed out by moderator',
                    expiry: tUser.muteExpiry,
                    moderatorId: ctx.userId,
                  });
                }
                this.addSystemMessage(
                  roomId,
                  `${tUser.displayName} has been timed out for ${timeoutDuration} seconds`
                );
                this.broadcastToRoom(roomId, {
                  type: 'user-timed-out',
                  data: { userId: targetId, duration: timeoutDuration, moderatorId: ctx.userId },
                });
                break;
              }
              case 'unmute': {
                const uUser = roomState.users[targetId];
                if (!uUser) {
                  socket.emit('error', { message: 'User not found' });
                  return;
                }
                uUser.isMuted = false;
                uUser.muteExpiry = undefined;
                const uSocket = this.socketByUser.get(targetId);
                if (uSocket) {
                  uSocket.emit('moderation', {
                    action: 'unmute',
                    moderatorId: ctx.userId,
                  });
                }
                this.addSystemMessage(roomId, `${uUser.displayName} has been unmuted`);
                break;
              }
            }
            console.log(
              `[ChatService] Moderation ${action} by ${moderator.username} in ${roomId}`
            );
          } catch (error) {
            console.error('[ChatService] Error applying moderation:', error);
            socket.emit('error', { message: 'Failed to apply moderation action' });
          }
        }
      );

      socket.on('leave-room', (data: { roomId: string }) => {
        try {
          this.handleUserLeave(socket, data.roomId);
        } catch (error) {
          console.error('[ChatService] Error leaving room:', error);
        }
      });

      socket.on('disconnect', () => {
        try {
          const ctx = this.contextBySocket.get(socket.id);
          if (ctx) {
            for (const [roomId, roomState] of this.chatRooms.entries()) {
              if (roomState.users[ctx.userId]) {
                this.handleUserLeave(socket, roomId);
              }
            }
            this.contextBySocket.delete(socket.id);
            this.socketByUser.delete(ctx.userId);
          }
        } catch (error) {
          console.error('[ChatService] Error handling disconnect:', error);
        }
      });
    });
  }

  private handleUserLeave(socket: Socket, roomId: string): void {
    const ctx = this.contextBySocket.get(socket.id);
    if (!ctx) return;
    const roomState = this.chatRooms.get(roomId);
    if (!roomState) return;
    const user = roomState.users[ctx.userId];
    if (!user) return;

    delete roomState.users[ctx.userId];
    roomState.userCount = Object.keys(roomState.users).length;
    socket.leave(roomId);

    this.broadcastToRoom(roomId, {
      type: 'user-left',
      data: { userId: ctx.userId, username: user.username },
    });
    this.addSystemMessage(roomId, `${user.displayName} left the chat`);

    if (roomState.userCount === 0 && !roomState.room.id.startsWith('stream_')) {
      setTimeout(() => {
        const current = this.chatRooms.get(roomId);
        if (current && current.userCount === 0) {
          this.chatRooms.delete(roomId);
          this.messageHistory.delete(roomId);
        }
      }, 10 * 60 * 1000);
    }
  }

  private createRoom(id: string, name: string, streamKey: string): ChatRoomState {
    const room: ChatRoom = {
      id,
      name,
      streamKey,
      isActive: true,
      createdAt: new Date(),
      userCount: 0,
      moderators: [],
      settings: { ...this.defaultRoomSettings },
    };
    const roomState: ChatRoomState = {
      room,
      users: {},
      messages: [],
      userCount: 0,
      lastActivity: new Date(),
    };
    this.chatRooms.set(id, roomState);
    this.messageHistory.set(id, []);
    this.addSystemMessage(id, `Welcome to ${name}!`);
    return roomState;
  }

  private addMessageToHistory(roomId: string, message: ChatMessage): void {
    let messages = this.messageHistory.get(roomId);
    if (!messages) {
      messages = [];
      this.messageHistory.set(roomId, messages);
    }
    messages.push(message);
    if (messages.length > 1000) messages.shift();
  }

  private broadcastToRoom(roomId: string, event: ChatEvent): void {
    this.io.to(roomId).emit(event.type, event.data);
  }

  private moderateMessage(message: string, additionalFilters: string[] = []): string {
    let moderated = message;
    const allFilters = [...this.bannedWords, ...additionalFilters];
    for (const word of allFilters) {
      if (!word) continue;
      const regex = new RegExp(`\\b${this.escapeRegExp(word)}\\b`, 'gi');
      moderated = moderated.replace(regex, '***');
    }
    return moderated;
  }

  private hasModeratorPermission(user: ChatUser): boolean {
    return user.roles.some((r) => ['moderator', 'admin', 'broadcaster'].includes(r));
  }

  private getRandomColor(): string {
    const colors = [
      '#FF4500', '#FF8C00', '#1E90FF', '#32CD32', '#9400D3',
      '#FF69B4', '#BA55D3', '#00BFFF', '#00FA9A', '#7CFC00',
      '#FF6347', '#8A2BE2', '#20B2AA', '#FF0000', '#4169E1',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  public addSystemMessage(roomId: string, message: string): void {
    if (!this.chatRooms.has(roomId)) return;
    const systemMessage: ChatMessage = {
      id: uuidv4(),
      roomId,
      userId: 'system',
      username: 'System',
      message,
      timestamp: new Date(),
      type: 'system',
    };
    this.addMessageToHistory(roomId, systemMessage);
    this.broadcastToRoom(roomId, { type: 'new-message', data: systemMessage });
  }

  public findRoomByStreamKey(streamKey: string): string | undefined {
    for (const [roomId, state] of this.chatRooms.entries()) {
      if (state.room.streamKey === streamKey) return roomId;
    }
    return undefined;
  }

  public getRoomData(roomId: string) {
    const roomState = this.chatRooms.get(roomId);
    if (!roomState) return null;
    return {
      id: roomState.room.id,
      name: roomState.room.name,
      streamKey: roomState.room.streamKey,
      userCount: roomState.userCount,
      isActive: roomState.room.isActive,
      createdAt: roomState.room.createdAt,
      lastActivity: roomState.lastActivity,
    };
  }

  public getActiveRooms() {
    const rooms = [];
    for (const [roomId, state] of this.chatRooms.entries()) {
      if (state.room.isActive) {
        rooms.push({
          id: roomId,
          name: state.room.name,
          streamKey: state.room.streamKey,
          userCount: state.userCount,
          createdAt: state.room.createdAt,
          lastActivity: state.lastActivity,
        });
      }
    }
    return rooms;
  }

  public updateRoomSettings(roomId: string, settings: Partial<ChatRoomSettings>): boolean {
    const roomState = this.chatRooms.get(roomId);
    if (!roomState) return false;
    roomState.room.settings = { ...roomState.room.settings, ...settings };
    this.addSystemMessage(roomId, 'Chat room settings have been updated');
    return true;
  }
}
