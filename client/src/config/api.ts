import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  User,
  Message,
  AttachmentAsset,
  UploadResponse,
  ChatGroup,
  GroupMember,
  GroupMessage,
} from '../types';

export const getHostIp = (): string => {
  // 1. Web browser: use the current host's IP/domain
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname;
  }

  // 2. Physical Mobile Phone via Expo Go: automatically extract host PC LAN IP (e.g. 192.168.29.31)
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri;

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip) return ip;
  }

  // 3. EC2 Cloud backend fallback
  return '3.121.186.237.sslip.io';
};

export const API_BASE_URL = 'https://3.121.186.237.sslip.io';

export interface SendMessagePayload {
  sender: string;
  recipient: string;
  body?: string;
  message_type?: string;
  media_url?: string | null;
  media_name?: string | null;
  media_size?: number | null;
  media_mime?: string | null;
  encryption_key?: string | null;
  encryption_iv?: string | null;
}

export interface SendGroupMessagePayload {
  sender: string;
  body?: string;
  message_type?: string;
  media_url?: string | null;
  media_name?: string | null;
  media_size?: number | null;
  media_mime?: string | null;
  encryption_key?: string | null;
  encryption_iv?: string | null;
}

export interface ConversationSummaryItem {
  id: number;
  sender: string;
  recipient: string;
  body: string;
  message_type: string;
  media_url?: string | null;
  media_name?: string | null;
  media_size?: number | null;
  created_at: string;
  counterpart_name?: string;
  counterpart_avatar?: string;
  counterpart_username: string;
}

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 404) {
      throw new Error('Backend endpoint not found. Please run "git pull && docker compose up -d --build api" on EC2.');
    }
    throw new Error(`Server error (${res.status}): ${text.substring(0, 120)}`);
  }
}

export const api = {
  // Authentication
  async register(username: string, password: string, displayName?: string, avatar?: string): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName, avatar }),
    });
    const data = await safeJson(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Registration failed');
    }
    return data.user;
  },

  async login(username: string, password: string): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await safeJson(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Login failed');
    }
    return data.user;
  },

  async sendOtp(phoneNumber: string): Promise<{ success: boolean; debugCode?: string }> {
    const res = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    });
    const data = await safeJson(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to send verification code');
    }
    return data;
  },

  async verifyOtp(phoneNumber: string, code: string, displayName?: string): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, code, displayName }),
    });
    const data = await safeJson(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Invalid verification code');
    }
    return data.user;
  },

  async phoneLogin(phoneNumber: string, displayName?: string, email?: string): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/api/auth/phone-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, displayName, email }),
    });
    const data = await safeJson(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Phone login failed');
    }
    return data.user;
  },

  async googleLogin(email: string, displayName?: string, avatar?: string, phoneNumber?: string): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/api/auth/google-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, displayName, avatar, phoneNumber }),
    });
    const data = await safeJson(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Google login failed');
    }
    return data.user;
  },

  async linkProfile(params: {
    userId: number;
    email?: string;
    phoneNumber?: string;
    displayName?: string;
    avatar?: string;
  }): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/api/user/link-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await safeJson(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update / merge profile');
    }
    return data.user;
  },

  async updatePrivacy(userId: number, hidePresence: boolean): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/api/user/privacy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, hidePresence }),
    });
    const data = await safeJson(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update privacy settings');
    }
    return data.user;
  },

  async getPresence(username: string): Promise<{ isOnline: boolean; lastSeen: string | null; hidePresence: boolean }> {
    const res = await fetch(`${API_BASE_URL}/api/presence/${encodeURIComponent(username)}`);
    const data = await safeJson(res);
    if (!res.ok || !data.success) {
      return { isOnline: false, lastSeen: null, hidePresence: true };
    }
    return {
      isOnline: Boolean(data.isOnline),
      lastSeen: data.lastSeen,
      hidePresence: Boolean(data.hidePresence),
    };
  },

  // Users
  async getUsers(excludeUsername: string | null = null): Promise<User[]> {
    const url = excludeUsername
      ? `${API_BASE_URL}/api/users?exclude=${encodeURIComponent(excludeUsername)}`
      : `${API_BASE_URL}/api/users`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch users');
    }
    return data.users;
  },

  // Messages
  async getMessages(user1: string, user2: string): Promise<Message[]> {
    const url = `${API_BASE_URL}/api/messages?user1=${encodeURIComponent(user1)}&user2=${encodeURIComponent(user2)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch messages');
    }
    return data.messages;
  },

  async sendMessage(messageData: SendMessagePayload): Promise<Message> {
    const res = await fetch(`${API_BASE_URL}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messageData),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to send message');
    }
    return data.message;
  },

  async getConversations(username: string): Promise<ConversationSummaryItem[]> {
    const res = await fetch(`${API_BASE_URL}/api/conversations?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch conversations');
    }
    return data.conversations;
  },

  // File & Video Upload (Multipart)
  async uploadFile(asset: AttachmentAsset): Promise<UploadResponse> {
    // 1. Native Mobile (Android & iOS): Use native uploadAsync to bypass React Native 0.86 FormDataPart issues
    if (Platform.OS !== 'web') {
      let fileUri = asset.uri;
      if (asset.bytes) {
        const safeName = `upload_${Date.now()}_${(asset.name || 'file.enc').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        try {
          const { File, Paths } = require('expo-file-system');
          const tempFile = new File(Paths.cache, safeName);
          tempFile.create({ overwrite: true });
          tempFile.write(asset.bytes);
          fileUri = tempFile.uri;
        } catch {
          const FileSystemLegacy = require('expo-file-system/legacy');
          const { uint8ArrayToBase64 } = require('../services/cryptoService');
          fileUri = `${FileSystemLegacy.cacheDirectory}${safeName}`;
          await FileSystemLegacy.writeAsStringAsync(fileUri, uint8ArrayToBase64(asset.bytes), {
            encoding: FileSystemLegacy.EncodingType.Base64,
          });
        }
      }

      const FileSystemLegacy = require('expo-file-system/legacy');
      const uploadResult = await FileSystemLegacy.uploadAsync(
        `${API_BASE_URL}/api/upload`,
        fileUri,
        {
          fieldName: 'file',
          httpMethod: 'POST',
          uploadType: FileSystemLegacy.FileSystemUploadType.MULTIPART,
        }
      );

      const data = JSON.parse(uploadResult.body);
      if (!data.success) {
        throw new Error(data.error || 'File upload failed');
      }
      return data.file;
    }

    // 2. Web: Use standard browser FormData
    const formData = new FormData();
    if (asset.blob) {
      formData.append('file', asset.blob, asset.name || 'encrypted.enc');
    } else if (asset.file) {
      formData.append('file', asset.file);
    } else {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      formData.append('file', blob, asset.name || 'upload.bin');
    }

    const res = await fetch(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'File upload failed');
    }
    return data.file;
  },

  // Groups API
  async createGroup(groupData: {
    name: string;
    avatar?: string;
    description?: string;
    created_by: string;
    members: string[];
  }): Promise<ChatGroup> {
    const res = await fetch(`${API_BASE_URL}/api/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(groupData),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to create group');
    }
    return data.group;
  },

  async getGroups(username: string): Promise<ChatGroup[]> {
    const res = await fetch(`${API_BASE_URL}/api/groups?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch groups');
    }
    return data.groups;
  },

  async getGroupMessages(groupId: number): Promise<GroupMessage[]> {
    const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/messages`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch group messages');
    }
    return data.messages;
  },

  async sendGroupMessage(groupId: number, payload: SendGroupMessagePayload): Promise<GroupMessage> {
    const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to send group message');
    }
    return data.message;
  },

  async getGroupMembers(groupId: number): Promise<GroupMember[]> {
    const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/members`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch group members');
    }
    return data.members;
  },
};

export default api;
