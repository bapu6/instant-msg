import { Platform } from 'react-native';
import { User } from '../types';

const SESSION_STORAGE_KEY = '@instant_msg_session_user';
const SESSION_FILE_NAME = 'instant_msg_session.json';

function getSessionFileUri(): string | null {
  try {
    const FileSystem = require('expo-file-system/legacy');
    if (FileSystem && FileSystem.documentDirectory) {
      return `${FileSystem.documentDirectory}${SESSION_FILE_NAME}`;
    }
  } catch (e) {
    console.warn('[SessionStorage] Could not resolve documentDirectory', e);
  }
  return null;
}

/**
 * Persist the logged-in User profile to local device storage.
 * Works seamlessly on Web (localStorage) and Mobile (expo-file-system).
 */
export async function saveUserSession(user: User): Promise<void> {
  try {
    const serialized = JSON.stringify(user);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SESSION_STORAGE_KEY, serialized);
      }
      return;
    }

    const fileUri = getSessionFileUri();
    if (fileUri) {
      const FileSystem = require('expo-file-system/legacy');
      await FileSystem.writeAsStringAsync(fileUri, serialized, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }
  } catch (err) {
    console.error('[SessionStorage] Failed to save user session:', err);
  }
}

/**
 * Retrieve the saved User profile from local device storage on app startup.
 */
export async function getUserSession(): Promise<User | null> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored) as User;
        }
      }
      return null;
    }

    const fileUri = getSessionFileUri();
    if (fileUri) {
      const FileSystem = require('expo-file-system/legacy');
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (content) {
          return JSON.parse(content) as User;
        }
      }
    }
  } catch (err) {
    console.warn('[SessionStorage] Failed to load user session:', err);
  }
  return null;
}

/**
 * Clear the saved user session on logout.
 */
export async function clearUserSession(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      }
      return;
    }

    const fileUri = getSessionFileUri();
    if (fileUri) {
      const FileSystem = require('expo-file-system/legacy');
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    }
  } catch (err) {
    console.warn('[SessionStorage] Failed to clear user session:', err);
  }
}

export default {
  saveUserSession,
  getUserSession,
  clearUserSession,
};
