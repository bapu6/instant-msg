export interface User {
  id: number;
  username: string;
  password?: string;
  display_name: string;
  email?: string | null;
  phone_number?: string | null;
  avatar: string;
  last_seen?: string | null;
  hide_presence?: boolean;
  is_online?: boolean;
  public_key?: string | null;
  encrypted_private_key?: string | null;
  key_salt?: string | null;
  key_iv?: string | null;
  created_at: string;
}

export type SafeUser = Omit<User, 'password'>;

export interface PhoneAuthInput {
  phoneNumber: string;
  displayName?: string;
  email?: string;
  avatar?: string;
}

export interface RegisterInput {
  username: string;
  password: string;
  displayName?: string;
  avatar?: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export type MessageType = 'text' | 'image' | 'video' | 'document' | 'file';

export interface Message {
  id: number;
  sender: string;
  recipient: string;
  body: string;
  message_type: MessageType;
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
  created_at: string;
}

export interface SaveMessageInput {
  sender: string;
  recipient: string;
  body?: string;
  message_type?: MessageType;
  media_url?: string | null;
  media_name?: string | null;
  media_size?: number | string | null;
  media_mime?: string | null;
  encryption_key?: string | null;
  encryption_iv?: string | null;
  is_delivered?: boolean;
  delivered_at?: string | null;
  is_read?: boolean;
  read_at?: string | null;
}

export interface RecentConversationSummary {
  id: number;
  sender: string;
  recipient: string;
  body: string;
  message_type: MessageType;
  media_url?: string | null;
  media_name?: string | null;
  media_size?: number | null;
  encryption_key?: string | null;
  encryption_iv?: string | null;
  is_delivered?: boolean;
  is_read?: boolean;
  created_at: string;
  counterpart_name?: string;
  counterpart_avatar?: string;
  counterpart_username: string;
  contact_status?: ContactStatus | null;
  initiated_by?: string | null;
  unread_count?: number;
  counterpart_public_key?: string | null;
}

export type ContactStatus = 'pending' | 'accepted' | 'declined' | 'blocked';

export interface Contact {
  id: number;
  user_id: string;
  contact_username: string;
  status: ContactStatus;
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

export interface PendingRequest {
  id: number;
  username: string;
  display_name: string;
  avatar?: string;
  initiated_by: string;
  created_at: string;
  last_message?: string;
  last_message_time?: string;
}

export interface UploadedFileResponse {
  url: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
  messageType: MessageType;
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

export interface CreateGroupInput {
  name: string;
  avatar?: string | null;
  description?: string | null;
  created_by: string;
  members: string[];
}

export interface SaveGroupMessageInput {
  group_id: number;
  sender: string;
  body?: string;
  message_type?: MessageType;
  media_url?: string | null;
  media_name?: string | null;
  media_size?: number | string | null;
  media_mime?: string | null;
  encryption_key?: string | null;
  encryption_iv?: string | null;
}
