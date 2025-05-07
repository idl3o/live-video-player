"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const socket_io_1 = require("socket.io");
const uuid_1 = require("uuid");
class ChatService {
    constructor(httpServer) {
        this.chatRooms = new Map();
        this.messageHistory = new Map();
        this.userSockets = new Map();
        this.socketUsers = new Map();
        // Word filter for moderation
        this.bannedWords = [
            // Basic list - add appropriate words for your use case
            "inappropriate1", "inappropriate2", "inappropriate3"
        ];
        // Default room settings
        this.defaultRoomSettings = {
            slowMode: false,
            slowModeInterval: 3, // seconds
            subscriberOnly: false,
            followerOnly: false,
            followerTimeRequired: 0, // minutes
            emoteOnly: false,
            filteredWords: [],
        };
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });
        this.setupSocketHandlers();
        console.log('[ChatService] Initialized');
    }
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`[ChatService] Client connected: ${socket.id}`);
            // Handle user authentication/registration
            socket.on('register', (data) => {
                try {
                    const userId = data.userId || (0, uuid_1.v4)();
                    const username = data.username;
                    const displayName = data.displayName || username;
                    // Store socket <-> user mapping
                    this.socketUsers.set(socket.id, userId);
                    this.userSockets.set(userId, socket);
                    // Acknowledge successful registration
                    socket.emit('registered', {
                        userId,
                        username,
                        displayName
                    });
                    console.log(`[ChatService] User registered: ${username} (${userId})`);
                }
                catch (error) {
                    console.error('[ChatService] Error during registration:', error);
                    socket.emit('error', { message: 'Registration failed' });
                }
            });
            // Handle joining a chat room
            socket.on('join-room', (data) => {
                var _a;
                try {
                    const { roomId, streamKey, user } = data;
                    const userId = this.socketUsers.get(socket.id);
                    if (!userId) {
                        socket.emit('error', { message: 'You must register first' });
                        return;
                    }
                    let targetRoomId = roomId;
                    // If stream key is provided, find or create a room for that stream
                    if (streamKey) {
                        const existingRoomId = this.findRoomByStreamKey(streamKey);
                        if (existingRoomId) {
                            targetRoomId = existingRoomId;
                        }
                        else {
                            // Create a new room for this stream
                            const newRoom = this.createRoom(`stream_${streamKey}`, `Stream Chat: ${streamKey}`, streamKey);
                            targetRoomId = newRoom.room.id;
                        }
                    }
                    // Create or update user in room
                    const chatUser = {
                        id: userId,
                        username: user.username || `user_${userId.substring(0, 8)}`,
                        displayName: user.displayName || user.username || `User ${userId.substring(0, 8)}`,
                        roles: user.roles || ['viewer'],
                        joinedAt: new Date(),
                        isBanned: false,
                        isMuted: false,
                        color: user.color || this.getRandomColor(),
                    };
                    // Get room state or create if it doesn't exist
                    let roomState = this.chatRooms.get(targetRoomId);
                    if (!roomState) {
                        roomState = this.createRoom(targetRoomId, `Chat Room ${targetRoomId}`, streamKey || targetRoomId);
                    }
                    // Add user to room
                    roomState.users[userId] = chatUser;
                    roomState.userCount = Object.keys(roomState.users).length;
                    roomState.lastActivity = new Date();
                    // Join socket to room
                    socket.join(targetRoomId);
                    // Get recent message history
                    const recentMessages = ((_a = this.messageHistory.get(targetRoomId)) === null || _a === void 0 ? void 0 : _a.slice(-50)) || [];
                    // Send room joined confirmation with recent messages
                    socket.emit('room-joined', {
                        roomId: targetRoomId,
                        user: chatUser,
                        recentMessages,
                        userCount: roomState.userCount,
                    });
                    // Broadcast user joined to room
                    this.broadcastToRoom(targetRoomId, {
                        type: 'user-joined',
                        data: {
                            user: {
                                id: chatUser.id,
                                username: chatUser.username,
                                displayName: chatUser.displayName,
                                color: chatUser.color
                            }
                        }
                    });
                    // Add system message about user joining
                    this.addSystemMessage(targetRoomId, `${chatUser.displayName} joined the chat`);
                    console.log(`[ChatService] User ${chatUser.username} joined room ${targetRoomId}. Total users: ${roomState.userCount}`);
                }
                catch (error) {
                    console.error('[ChatService] Error joining room:', error);
                    socket.emit('error', { message: 'Failed to join chat room' });
                }
            });
            // Handle sending a message
            socket.on('send-message', (data) => {
                var _a;
                try {
                    const { roomId, message, replyToId } = data;
                    const userId = this.socketUsers.get(socket.id);
                    if (!userId) {
                        socket.emit('error', { message: 'You must register first' });
                        return;
                    }
                    const roomState = this.chatRooms.get(roomId);
                    if (!roomState) {
                        socket.emit('error', { message: 'Room not found' });
                        return;
                    }
                    const user = roomState.users[userId];
                    if (!user) {
                        socket.emit('error', { message: 'You are not in this room' });
                        return;
                    }
                    // Check if user is banned
                    if (user.isBanned) {
                        socket.emit('error', { message: 'You are banned from this chat' });
                        return;
                    }
                    // Check if user is muted
                    if (user.isMuted) {
                        if (!user.muteExpiry || user.muteExpiry > new Date()) {
                            socket.emit('error', { message: 'You are muted in this chat' });
                            return;
                        }
                        else {
                            // Mute expired, unmute user
                            user.isMuted = false;
                            user.muteExpiry = undefined;
                        }
                    }
                    // Check slow mode
                    if (roomState.room.settings.slowMode && !this.hasModeratorPermission(user)) {
                        // Find user's last message
                        const userMessages = ((_a = this.messageHistory.get(roomId)) === null || _a === void 0 ? void 0 : _a.filter(msg => msg.userId === userId && msg.type === 'message')) || [];
                        const lastMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
                        if (lastMessage) {
                            const secondsSinceLastMessage = (Date.now() - lastMessage.timestamp.getTime()) / 1000;
                            if (secondsSinceLastMessage < roomState.room.settings.slowModeInterval) {
                                const waitTime = Math.ceil(roomState.room.settings.slowModeInterval - secondsSinceLastMessage);
                                socket.emit('error', {
                                    message: `Slow mode is enabled. Please wait ${waitTime} seconds before sending another message.`
                                });
                                return;
                            }
                        }
                    }
                    // Check subscriber-only mode
                    if (roomState.room.settings.subscriberOnly &&
                        !user.roles.includes('subscriber') &&
                        !this.hasModeratorPermission(user)) {
                        socket.emit('error', { message: 'This chat is in subscriber-only mode' });
                        return;
                    }
                    // Apply content moderation
                    let moderatedMessage = this.moderateMessage(message, roomState.room.settings.filteredWords);
                    let isModerated = moderatedMessage !== message;
                    // Create chat message
                    const chatMessage = {
                        id: (0, uuid_1.v4)(),
                        roomId,
                        userId,
                        username: user.username,
                        message: moderatedMessage,
                        timestamp: new Date(),
                        type: 'message',
                        replyToId,
                        isModerated,
                        moderationReason: isModerated ? 'Contained filtered words' : undefined
                    };
                    // Add to message history
                    this.addMessageToHistory(roomId, chatMessage);
                    // Update room activity timestamp
                    roomState.lastActivity = new Date();
                    // Broadcast message to room
                    this.broadcastToRoom(roomId, {
                        type: 'new-message',
                        data: chatMessage
                    });
                    console.log(`[ChatService] Message in ${roomId}: ${user.username}: ${moderatedMessage.substring(0, 50)}${moderatedMessage.length > 50 ? '...' : ''}`);
                }
                catch (error) {
                    console.error('[ChatService] Error sending message:', error);
                    socket.emit('error', { message: 'Failed to send message' });
                }
            });
            // Handle moderation actions
            socket.on('moderate', (data) => {
                try {
                    const { roomId, action, targetId, messageId, duration, reason } = data;
                    const moderatorId = this.socketUsers.get(socket.id);
                    if (!moderatorId) {
                        socket.emit('error', { message: 'You must register first' });
                        return;
                    }
                    const roomState = this.chatRooms.get(roomId);
                    if (!roomState) {
                        socket.emit('error', { message: 'Room not found' });
                        return;
                    }
                    const moderator = roomState.users[moderatorId];
                    if (!moderator) {
                        socket.emit('error', { message: 'You are not in this room' });
                        return;
                    }
                    // Check if user has moderation permissions
                    if (!this.hasModeratorPermission(moderator)) {
                        socket.emit('error', { message: 'You do not have permission to moderate' });
                        return;
                    }
                    switch (action) {
                        case 'delete':
                            if (!messageId) {
                                socket.emit('error', { message: 'Message ID is required' });
                                return;
                            }
                            // Find message in history
                            const messages = this.messageHistory.get(roomId) || [];
                            const messageIndex = messages.findIndex(msg => msg.id === messageId);
                            if (messageIndex === -1) {
                                socket.emit('error', { message: 'Message not found' });
                                return;
                            }
                            // Mark message as moderated
                            messages[messageIndex].isModerated = true;
                            messages[messageIndex].message = '[Message removed by moderator]';
                            messages[messageIndex].moderationReason = reason || 'Removed by moderator';
                            // Broadcast message deletion
                            this.broadcastToRoom(roomId, {
                                type: 'message-moderated',
                                data: {
                                    messageId,
                                    action: 'delete',
                                    moderatorId
                                }
                            });
                            break;
                        case 'ban':
                            // Find target user
                            const banUser = roomState.users[targetId];
                            if (!banUser) {
                                socket.emit('error', { message: 'User not found' });
                                return;
                            }
                            // Ban the user
                            banUser.isBanned = true;
                            // Notify user of ban
                            const banUserSocket = this.userSockets.get(targetId);
                            if (banUserSocket) {
                                banUserSocket.emit('moderation', {
                                    action: 'ban',
                                    reason: reason || 'Banned by moderator',
                                    moderatorId
                                });
                                // Force leave room
                                banUserSocket.leave(roomId);
                                delete roomState.users[targetId];
                                roomState.userCount = Object.keys(roomState.users).length;
                            }
                            // Add system message
                            this.addSystemMessage(roomId, `${banUser.displayName} has been banned by moderator`);
                            // Broadcast user banned
                            this.broadcastToRoom(roomId, {
                                type: 'user-banned',
                                data: {
                                    userId: targetId,
                                    moderatorId
                                }
                            });
                            break;
                        case 'timeout':
                            // Find target user
                            const timeoutUser = roomState.users[targetId];
                            if (!timeoutUser) {
                                socket.emit('error', { message: 'User not found' });
                                return;
                            }
                            // Set timeout
                            const timeoutDuration = duration || 300; // Default 5 minutes
                            timeoutUser.isMuted = true;
                            timeoutUser.muteExpiry = new Date(Date.now() + timeoutDuration * 1000);
                            // Notify user of timeout
                            const timeoutUserSocket = this.userSockets.get(targetId);
                            if (timeoutUserSocket) {
                                timeoutUserSocket.emit('moderation', {
                                    action: 'timeout',
                                    duration: timeoutDuration,
                                    reason: reason || 'Timed out by moderator',
                                    expiry: timeoutUser.muteExpiry,
                                    moderatorId
                                });
                            }
                            // Add system message
                            this.addSystemMessage(roomId, `${timeoutUser.displayName} has been timed out for ${timeoutDuration} seconds`);
                            // Broadcast user timed out
                            this.broadcastToRoom(roomId, {
                                type: 'user-timed-out',
                                data: {
                                    userId: targetId,
                                    duration: timeoutDuration,
                                    moderatorId
                                }
                            });
                            break;
                        case 'unmute':
                            // Find target user
                            const unmuteUser = roomState.users[targetId];
                            if (!unmuteUser) {
                                socket.emit('error', { message: 'User not found' });
                                return;
                            }
                            // Unmute the user
                            unmuteUser.isMuted = false;
                            unmuteUser.muteExpiry = undefined;
                            // Notify user of unmute
                            const unmuteUserSocket = this.userSockets.get(targetId);
                            if (unmuteUserSocket) {
                                unmuteUserSocket.emit('moderation', {
                                    action: 'unmute',
                                    moderatorId
                                });
                            }
                            // Add system message
                            this.addSystemMessage(roomId, `${unmuteUser.displayName} has been unmuted`);
                            break;
                    }
                    console.log(`[ChatService] Moderation action: ${action} by ${moderator.username} in room ${roomId}`);
                }
                catch (error) {
                    console.error('[ChatService] Error applying moderation:', error);
                    socket.emit('error', { message: 'Failed to apply moderation action' });
                }
            });
            // Handle leaving a room
            socket.on('leave-room', (data) => {
                try {
                    const { roomId } = data;
                    this.handleUserLeave(socket, roomId);
                }
                catch (error) {
                    console.error('[ChatService] Error leaving room:', error);
                }
            });
            // Handle disconnect
            socket.on('disconnect', () => {
                try {
                    const userId = this.socketUsers.get(socket.id);
                    if (userId) {
                        // Leave all rooms the user is in
                        for (const [roomId, roomState] of this.chatRooms.entries()) {
                            if (roomState.users[userId]) {
                                this.handleUserLeave(socket, roomId);
                            }
                        }
                        // Clean up socket tracking
                        this.socketUsers.delete(socket.id);
                        this.userSockets.delete(userId);
                    }
                    console.log(`[ChatService] Client disconnected: ${socket.id}`);
                }
                catch (error) {
                    console.error('[ChatService] Error handling disconnect:', error);
                }
            });
        });
    }
    handleUserLeave(socket, roomId) {
        const userId = this.socketUsers.get(socket.id);
        if (!userId)
            return;
        const roomState = this.chatRooms.get(roomId);
        if (!roomState)
            return;
        const user = roomState.users[userId];
        if (!user)
            return;
        // Remove user from room
        delete roomState.users[userId];
        roomState.userCount = Object.keys(roomState.users).length;
        // Leave socket room
        socket.leave(roomId);
        // Broadcast user left
        this.broadcastToRoom(roomId, {
            type: 'user-left',
            data: { userId, username: user.username }
        });
        // Add system message
        this.addSystemMessage(roomId, `${user.displayName} left the chat`);
        console.log(`[ChatService] User ${user.username} left room ${roomId}. Total users: ${roomState.userCount}`);
        // Clean up empty rooms after delay (except for stream rooms)
        if (roomState.userCount === 0 && !roomState.room.id.startsWith('stream_')) {
            setTimeout(() => {
                const currentRoom = this.chatRooms.get(roomId);
                if (currentRoom && currentRoom.userCount === 0) {
                    console.log(`[ChatService] Removing empty room: ${roomId}`);
                    this.chatRooms.delete(roomId);
                    this.messageHistory.delete(roomId);
                }
            }, 10 * 60 * 1000); // 10 minutes
        }
    }
    createRoom(id, name, streamKey) {
        // Create room object
        const room = {
            id,
            name,
            streamKey,
            isActive: true,
            createdAt: new Date(),
            userCount: 0,
            moderators: [],
            settings: { ...this.defaultRoomSettings }
        };
        // Create room state
        const roomState = {
            room,
            users: {},
            messages: [],
            userCount: 0,
            lastActivity: new Date()
        };
        // Initialize message history
        this.chatRooms.set(id, roomState);
        this.messageHistory.set(id, []);
        // Add welcome message
        this.addSystemMessage(id, `Welcome to ${name}!`);
        console.log(`[ChatService] Created new room: ${id} (${name}) for stream: ${streamKey}`);
        return roomState;
    }
    addMessageToHistory(roomId, message) {
        let messages = this.messageHistory.get(roomId);
        if (!messages) {
            messages = [];
            this.messageHistory.set(roomId, messages);
        }
        messages.push(message);
        // Cap history at 1000 messages per room
        if (messages.length > 1000) {
            messages.shift();
        }
    }
    broadcastToRoom(roomId, event) {
        this.io.to(roomId).emit(event.type, event.data);
    }
    moderateMessage(message, additionalFilters = []) {
        let moderated = message;
        // Combine global and room-specific filters
        const allFilters = [...this.bannedWords, ...additionalFilters];
        if (allFilters.length > 0) {
            allFilters.forEach(word => {
                if (!word)
                    return;
                // Basic word boundary matching
                const regex = new RegExp(`\\b${this.escapeRegExp(word)}\\b`, 'gi');
                moderated = moderated.replace(regex, '***');
            });
        }
        return moderated;
    }
    hasModeratorPermission(user) {
        return user.roles.some(role => ['moderator', 'admin', 'broadcaster'].includes(role));
    }
    // Utility: Generate random color for user names
    getRandomColor() {
        const colors = [
            '#FF4500', '#FF8C00', '#1E90FF', '#32CD32', '#9400D3',
            '#FF69B4', '#BA55D3', '#00BFFF', '#00FA9A', '#7CFC00',
            '#FF6347', '#8A2BE2', '#20B2AA', '#FF0000', '#4169E1'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    // Utility: Escape regex special characters
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    // Public API methods
    addSystemMessage(roomId, message) {
        if (!this.chatRooms.has(roomId))
            return;
        const systemMessage = {
            id: (0, uuid_1.v4)(),
            roomId,
            userId: 'system',
            username: 'System',
            message,
            timestamp: new Date(),
            type: 'system'
        };
        // Add to history
        this.addMessageToHistory(roomId, systemMessage);
        // Broadcast to room
        this.broadcastToRoom(roomId, {
            type: 'new-message',
            data: systemMessage
        });
    }
    findRoomByStreamKey(streamKey) {
        for (const [roomId, state] of this.chatRooms.entries()) {
            if (state.room.streamKey === streamKey) {
                return roomId;
            }
        }
        return undefined;
    }
    getRoomData(roomId) {
        const roomState = this.chatRooms.get(roomId);
        if (!roomState)
            return null;
        return {
            id: roomState.room.id,
            name: roomState.room.name,
            streamKey: roomState.room.streamKey,
            userCount: roomState.userCount,
            isActive: roomState.room.isActive,
            createdAt: roomState.room.createdAt,
            lastActivity: roomState.lastActivity
        };
    }
    getActiveRooms() {
        const rooms = [];
        for (const [roomId, state] of this.chatRooms.entries()) {
            if (state.room.isActive) {
                rooms.push({
                    id: roomId,
                    name: state.room.name,
                    streamKey: state.room.streamKey,
                    userCount: state.userCount,
                    createdAt: state.room.createdAt,
                    lastActivity: state.lastActivity
                });
            }
        }
        return rooms;
    }
    updateRoomSettings(roomId, settings) {
        const roomState = this.chatRooms.get(roomId);
        if (!roomState)
            return false;
        // Update room settings
        roomState.room.settings = {
            ...roomState.room.settings,
            ...settings
        };
        // Notify room of settings change
        this.addSystemMessage(roomId, 'Chat room settings have been updated');
        return true;
    }
}
exports.ChatService = ChatService;
