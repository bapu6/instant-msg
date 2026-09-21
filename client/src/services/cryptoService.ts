/**
 * Client-Side End-to-End Encryption (E2EE) for Media & Attachments
 * Uses standard AES-GCM-256 (Interoperable across Web and React Native Mobile)
 *
 * S3 only ever stores encrypted binary blobs (.enc).
 * Decryption keys are NEVER sent to the S3 bucket or storage provider.
 */

import { Platform } from 'react-native';
import { gcm } from '@noble/ciphers/aes.js';
import * as ExpoCrypto from 'expo-crypto';

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Universal Uint8Array to Base64 encoder (pure JS, safe for Hermes / RN / Web)
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let res = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    res += B64_CHARS[b0 >> 2];
    res += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    res += i + 1 < len ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    res += i + 2 < len ? B64_CHARS[b2 & 63] : '=';
  }
  return res;
}

/**
 * Universal Base64 to Uint8Array decoder (pure JS, safe for Hermes / RN / Web)
 */
export function base64ToUint8Array(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const byteLen = Math.floor((len * 3) / 4);
  const bytes = new Uint8Array(byteLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = B64_CHARS.indexOf(clean[i]);
    const c1 = B64_CHARS.indexOf(clean[i + 1]);
    const c2 = B64_CHARS.indexOf(clean[i + 2]);
    const c3 = B64_CHARS.indexOf(clean[i + 3]);
    bytes[p++] = (c0 << 2) | (c1 >> 4);
    if (c2 !== -1 && p < byteLen) bytes[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 !== -1 && p < byteLen) bytes[p++] = ((c2 & 3) << 6) | c3;
  }
  return bytes;
}

/**
 * Cryptographically secure random bytes generator across platforms
 */
export function getRandomBytes(byteCount: number): Uint8Array {
  const arr = new Uint8Array(byteCount);
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    return cryptoObj.getRandomValues(arr);
  }
  return ExpoCrypto.getRandomValues(arr);
}

/**
 * Robust cross-platform reader for picked files (works with Android content://, file://, or Web File)
 */
export async function readAssetBytes(asset: {
  uri: string;
  file?: any;
  bytes?: Uint8Array;
}): Promise<Uint8Array> {
  if (asset.bytes && asset.bytes.length > 0) {
    return asset.bytes;
  }

  // 1. Web file object
  if (asset.file && typeof asset.file.arrayBuffer === 'function') {
    const ab = await asset.file.arrayBuffer();
    return new Uint8Array(ab);
  }

  // 2. Mobile (Android / iOS): Use expo-file-system to avoid React Native's Blob constructor issues
  if (Platform.OS !== 'web') {
    // 2a. Expo SDK 57 File.bytes()
    try {
      const { File } = require('expo-file-system');
      const file = new File(asset.uri);
      const bytes = await file.bytes();
      if (bytes && bytes.length > 0) {
        return bytes;
      }
    } catch {
      // Fall through to legacy
    }

    // 2b. Legacy FileSystem base64 read
    try {
      const FileSystemLegacy = require('expo-file-system/legacy');
      const base64 = await FileSystemLegacy.readAsStringAsync(asset.uri, {
        encoding: FileSystemLegacy.EncodingType.Base64,
      });
      if (base64) {
        return base64ToUint8Array(base64);
      }
    } catch (err) {
      console.warn('Legacy file system read failed:', err);
    }
  }

  // 3. Fallback to fetch for web blob: or data: URIs
  const res = await fetch(asset.uri);
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

export interface EncryptedMediaResult {
  encryptedBlob?: Blob | null;
  encryptedBytes: Uint8Array;
  encryptionKey: string;
  encryptionIv: string;
}

export class CryptoService {
  /**
   * Encrypts a raw file ArrayBuffer / Uint8Array using AES-GCM 256
   */
  public async encryptFile(fileBuffer: ArrayBuffer | Uint8Array): Promise<EncryptedMediaResult> {
    const plainBytes = fileBuffer instanceof Uint8Array ? fileBuffer : new Uint8Array(fileBuffer);

    // 1. Generate 256-bit (32-byte) AES key
    const rawKey = getRandomBytes(32);

    // 2. Generate random 12-byte IV (NIST recommended standard for AES-GCM)
    const iv = getRandomBytes(12);

    let ciphertextBytes: Uint8Array;

    // Check if native Web Cryptography API is available (fast on Web)
    const cryptoObj = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
    if (cryptoObj && cryptoObj.subtle) {
      try {
        const key = await cryptoObj.subtle.importKey(
          'raw',
          rawKey,
          { name: 'AES-GCM' },
          false,
          ['encrypt']
        );
        const encrypted = await cryptoObj.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          plainBytes
        );
        ciphertextBytes = new Uint8Array(encrypted);
      } catch {
        // Fallback to noble AES-GCM
        const cipher = gcm(rawKey, iv);
        ciphertextBytes = cipher.encrypt(plainBytes);
      }
    } else {
      // Universal pure JS AES-GCM for React Native Hermes & mobile
      const cipher = gcm(rawKey, iv);
      ciphertextBytes = cipher.encrypt(plainBytes);
    }

    const keyBase64 = uint8ArrayToBase64(rawKey);
    const ivBase64 = uint8ArrayToBase64(iv);

    // ONLY instantiate Blob on web. React Native Hermes throws:
    // "Creating blob from ArrayBuffer and ArrayBufferView is not supported"
    let encryptedBlob: Blob | null = null;
    if (Platform.OS === 'web' && typeof Blob !== 'undefined') {
      encryptedBlob = new Blob([ciphertextBytes as any], { type: 'application/octet-stream' });
    }

    return {
      encryptedBlob,
      encryptedBytes: ciphertextBytes,
      encryptionKey: keyBase64,
      encryptionIv: ivBase64,
    };
  }

  /**
   * Decrypts ciphertext using AES-GCM 256 with provided base64 key and IV
   */
  public async decryptFile(
    ciphertext: ArrayBuffer | Uint8Array,
    keyBase64: string,
    ivBase64: string
  ): Promise<Uint8Array> {
    if (!keyBase64 || !ivBase64) {
      throw new Error('Decryption failed: Missing encryption key or initialization vector');
    }

    const rawKey = base64ToUint8Array(keyBase64);
    const iv = base64ToUint8Array(ivBase64);
    const cipherBytes = ciphertext instanceof Uint8Array ? ciphertext : new Uint8Array(ciphertext);

    if (rawKey.length !== 32) {
      throw new Error(`Invalid AES key length (${rawKey.length} bytes, expected 32 bytes)`);
    }

    // Attempt native WebCrypto first if available
    const cryptoObj = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
    if (cryptoObj && cryptoObj.subtle) {
      try {
        const key = await cryptoObj.subtle.importKey(
          'raw',
          rawKey,
          { name: 'AES-GCM' },
          false,
          ['decrypt']
        );
        const decrypted = await cryptoObj.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          cipherBytes
        );
        return new Uint8Array(decrypted);
      } catch (err) {
        // WebCrypto failed or threw; fall through to noble ciphers
        console.warn('Native subtle decrypt fallback to noble ciphers:', err);
      }
    }

    // Universal pure JS AES-GCM decryption
    try {
      const cipher = gcm(rawKey, iv);
      return cipher.decrypt(cipherBytes);
    } catch (err: any) {
      throw new Error(`Decryption failed: ${err.message || 'Tampered data or invalid key'}`);
    }
  }
}

export default new CryptoService();
