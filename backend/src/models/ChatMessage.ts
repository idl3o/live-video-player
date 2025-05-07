export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
  type: 'message' | 'system' | 'moderation';
  replyToId?: string;
  isModerated?: boolean;
  moderationReason?: string;
}

export interface ChatUser {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  joinedAt: Date;
  isBanned: boolean;
  isMuted: boolean;
  muteExpiry?: Date;
  color: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  streamKey: string;
  isActive: boolean;
  createdAt: Date;
  userCount: number;
  moderators: string[];
  settings: ChatRoomSettings;
}

export interface ChatRoomSettings {
  slowMode: boolean;
  slowModeInterval: number; // seconds
  subscriberOnly: boolean;
  followerOnly: boolean;
  followerTimeRequired: number; // minutes
  emoteOnly: boolean;
  filteredWords: string[];
}

export interface ChatRoomState {
  room: ChatRoom;
  users: {[userId: string]: ChatUser};
  messages: ChatMessage[];
  userCount: number;
  lastActivity: Date;
}

export interface ChatEvent {
  type: string;
  data: any;
}