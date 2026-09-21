export interface User {
  id: number;
  username: string;
  display_name?: string;
  email?: string | null;
  phone_number?: string | null;
  avatar?: string;
  last_seen?: string | null;
  hide_presence?: boolean;
  is_online?: boolean;
  created_at?: string;
}

export type MessageType = 'text' | 'image' | 'video' | 'document' | 'file';

export interface Message {
  id: number | string;
  sender: string;
  recipient: string;
  body: string;
  message_type?: MessageType;
  media_url?: string | null;
  media_name?: string | null;
  media_size?: number | null;
  media_mime?: string | null;
  encryption_key?: string | null;
  encryption_iv?: string | null;
  is_delivered?: boolean;
  delivered_at?: string | null;
  is_read?: boolean;
  read_at?: string | null;
  created_at?: string;
}

export interface ChatContact {
  id: string;
  username?: string;
  name: string;
  display_name?: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unreadCount: number;
  isOnline: boolean;
  isGroup: boolean;
  lastSeen?: string | null;
  hidePresence?: boolean;
  isDelivered?: boolean;
  isRead?: boolean;
  isTyping?: boolean;
  contactStatus?: 'pending' | 'accepted' | 'declined' | 'none';
  initiatedBy?: string;
  phoneNumber?: string | null;
  email?: string | null;
  timestamp?: number;
}

export interface ContactItem {
  id: number;
  user_id: string;
  contact_username: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  initiated_by: string;
  created_at: string;
  updated_at: string;
  display_name?: string;
  avatar?: string;
  phone_number?: string | null;
  email?: string | null;
  is_online?: boolean;
  last_seen?: string | null;
  hide_presence?: boolean;
}

export interface PendingRequestItem {
  id: number;
  username: string;
  display_name: string;
  avatar?: string;
  initiated_by: string;
  created_at: string;
  last_message?: string;
  last_message_time?: string;
}

export interface SearchedUser extends User {
  contact_status?: 'pending' | 'accepted' | 'declined' | null;
  is_mutual?: boolean;
}

export interface StoryItem {
  id: string;
  name: string;
  avatar: string;
  hasUnseen?: boolean;
}

export interface QuickActionItem {
  id: string;
  label: string;
  icon: any;
  bgColor: string;
  iconColor: string;
}

export type FilterType = 'All' | 'Unread' | 'Groups' | 'Direct';

export interface AttachmentAsset {
  uri: string;
  name?: string;
  mimeType?: string;
  size?: number;
  file?: File;
  blob?: Blob;
  bytes?: Uint8Array;
}

export interface UploadResponse {
  url: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
  messageType: MessageType;
}

export interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  isInitializing: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<User>;
  register: (username: string, password: string, displayName?: string, avatar?: string) => Promise<User>;
  sendOtp: (phoneNumber: string) => Promise<{ success: boolean; debugCode?: string }>;
  verifyOtp: (phoneNumber: string, code: string, displayName?: string) => Promise<User>;
  phoneLogin: (phoneNumber: string, displayName?: string) => Promise<User>;
  googleSignIn: () => Promise<User>;
  logout: () => void;
  setCurrentUser: (user: User | null) => void;
}

export interface ChatGroup {
  id: number;
  name: string;
  avatar?: string | null;
  description?: string | null;
  created_by: string;
  created_at: string;
  member_count?: number;
  last_message?: string | null;
  last_message_time?: string | null;
}

export interface GroupMember {
  id: number;
  group_id: number;
  username: string;
  role: string;
  joined_at: string;
  display_name?: string;
  avatar?: string;
}

export interface GroupMessage {
  id: number;
  group_id: number;
  sender: string;
  sender_name?: string;
  sender_avatar?: string;
  body: string;
  message_type: MessageType;
  media_url?: string | null;
  media_name?: string | null;
  media_size?: number | null;
  media_mime?: string | null;
  encryption_key?: string | null;
  encryption_iv?: string | null;
  created_at: string;
}

export interface CallState {
  isActive: boolean;
  isIncoming: boolean;
  remoteUser: string;
  remoteDisplayName?: string;
  remoteAvatar?: string;
  isVideo: boolean;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  durationSeconds: number;
  status: 'idle' | 'ringing' | 'connected' | 'ended';
}
