/**
 * Client-Side End-to-End Encryption (E2EE) for Media & Attachments
 * Uses standard AES-GCM-256 (Interoperable across Web and React Native Mobile)
 *
 * S3 only ever stores encrypted binary blobs (.enc).
 * Decryption keys are NEVER sent to the S3 bucket or storage provider.
 */

import { Platform } from 'react-native';
import { gcm } from '@noble/ciphers/aes.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as ExpoCrypto from 'expo-crypto';

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export interface KeyPair {
  publicKey: string; // base64
  privateKey: string; // base64
}

export interface EncryptedPrivateKeyBackup {
  encryptedPrivateKey: string; // base64
  keySalt: string; // base64
  keyIv: string; // base64
}

/**
 * Universal UTF-8 to Uint8Array encoder (pure JS, safe for Hermes / RN / Web)
 */
export function utf8ToBytes(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const utf8: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let charcode = str.charCodeAt(i);
    if (charcode < 0x80) utf8.push(charcode);
    else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    }
  }
  return new Uint8Array(utf8);
}

/**
 * Universal Uint8Array to UTF-8 decoder (pure JS, safe for Hermes / RN / Web)
 */
export function bytesToUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  let out = '';
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const c = bytes[i++];
    if (c < 128) {
      out += String.fromCharCode(c);
    } else if (c > 191 && c < 224) {
      const c2 = bytes[i++];
      out += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
    } else if (c > 223 && c < 240) {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      out += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
    } else {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      const c4 = bytes[i++];
      let u = (((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) - 0x10000;
      out += String.fromCharCode((u >> 10) + 0xd800, (u & 0x3ff) + 0xdc00);
    }
  }
  return out;
}

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

  // 2. Mobile (Android & iOS): Use expo-file-system native readers
  if (Platform.OS !== 'web') {
    let FileSystemLegacy: any = null;
    try {
      FileSystemLegacy = require('expo-file-system/legacy');
    } catch {
      try {
        FileSystemLegacy = require('expo-file-system');
      } catch {}
    }

    if (FileSystemLegacy) {
      let targetUri = asset.uri;

      // 2a. On Android content:// URIs, copy to local cache file first
      if (targetUri.startsWith('content://')) {
        try {
          const safeExt = ((asset as any).name || 'file').split('.').pop() || 'bin';
          const cachePath = `${FileSystemLegacy.cacheDirectory}pick_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${safeExt}`;
          await FileSystemLegacy.copyAsync({
            from: targetUri,
            to: cachePath,
          });
          targetUri = cachePath;
        } catch (copyErr) {
          console.warn('[readAssetBytes] copyAsync failed, using original uri:', copyErr);
        }
      }

      // 2b. Read base64 from file URI
      try {
        const base64 = await FileSystemLegacy.readAsStringAsync(targetUri, {
          encoding: FileSystemLegacy.EncodingType?.Base64 || 'base64',
        });
        if (base64) {
          return base64ToUint8Array(base64);
        }
      } catch (readErr) {
        console.warn('[readAssetBytes] readAsStringAsync failed:', readErr);
      }
    }

    // 2c. Expo SDK 57 File.bytes() fallback
    try {
      const { File } = require('expo-file-system');
      const file = new File(asset.uri);
      const bytes = await file.bytes();
      if (bytes && bytes.length > 0) {
        return bytes;
      }
    } catch (err) {
      console.warn('[readAssetBytes] Expo SDK 57 File.bytes() read failed:', err);
    }

    throw new Error('Unable to read selected file from mobile device storage.');
  }

  // 3. Fallback to fetch for web blob: or data: URIs only
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

  // ==========================================
  // End-to-End Encryption (E2EE) Key Exchange
  // ==========================================

  /**
   * Generates a new random X25519 keypair for the user
   */
  public generateKeyPair(): KeyPair {
    const priv = getRandomBytes(32);
    const pub = x25519.getPublicKey(priv);
    return {
      publicKey: uint8ArrayToBase64(pub),
      privateKey: uint8ArrayToBase64(priv),
    };
  }

  /**
   * Derives a 32-byte shared secret from my private key and the counterpart's public key (Diffie-Hellman)
   */
  public computeSharedKey(myPrivateKeyB64: string, theirPublicKeyB64: string): Uint8Array {
    const myPriv = base64ToUint8Array(myPrivateKeyB64);
    const theirPub = base64ToUint8Array(theirPublicKeyB64);
    if (myPriv.length !== 32 || theirPub.length !== 32) {
      throw new Error('Invalid key length for X25519 ECDH');
    }
    return x25519.getSharedSecret(myPriv, theirPub);
  }

  /**
   * Encrypts a text message with AES-256-GCM using the pairwise shared secret
   */
  public encryptTextMessage(
    text: string,
    myPrivateKeyB64: string,
    theirPublicKeyB64: string
  ): { ciphertext: string; iv: string } {
    const sharedKey = this.computeSharedKey(myPrivateKeyB64, theirPublicKeyB64);
    const iv = getRandomBytes(12);
    const plainBytes = utf8ToBytes(text);
    const cipher = gcm(sharedKey, iv);
    const cipherBytes = cipher.encrypt(plainBytes);
    return {
      ciphertext: uint8ArrayToBase64(cipherBytes),
      iv: uint8ArrayToBase64(iv),
    };
  }

  /**
   * Decrypts a text message with AES-256-GCM using the pairwise shared secret
   */
  public decryptTextMessage(
    ciphertextB64: string,
    ivB64: string | null | undefined,
    myPrivateKeyB64: string,
    theirPublicKeyB64: string
  ): string {
    if (!ivB64 || !ciphertextB64) return ciphertextB64;
    try {
      const sharedKey = this.computeSharedKey(myPrivateKeyB64, theirPublicKeyB64);
      const iv = base64ToUint8Array(ivB64);
      const cipherBytes = base64ToUint8Array(ciphertextB64);
      const cipher = gcm(sharedKey, iv);
      const plainBytes = cipher.decrypt(cipherBytes);
      return bytesToUtf8(plainBytes);
    } catch {
      // Return raw string as fallback for legacy unencrypted messages
      return ciphertextB64;
    }
  }

  /**
   * Encrypts a media decryption key so S3/server never sees the plaintext media key
   */
  public encryptMediaKey(
    mediaKeyB64: string,
    myPrivateKeyB64: string,
    theirPublicKeyB64: string
  ): { encryptedKey: string; keyIv: string } {
    const sharedKey = this.computeSharedKey(myPrivateKeyB64, theirPublicKeyB64);
    const iv = getRandomBytes(12);
    const plainBytes = base64ToUint8Array(mediaKeyB64);
    const cipher = gcm(sharedKey, iv);
    const cipherBytes = cipher.encrypt(plainBytes);
    return {
      encryptedKey: uint8ArrayToBase64(cipherBytes),
      keyIv: uint8ArrayToBase64(iv),
    };
  }

  /**
   * Decrypts the media AES key using the pairwise shared secret
   */
  public decryptMediaKey(
    encryptedKeyB64: string | null | undefined,
    keyIvB64: string | null | undefined,
    myPrivateKeyB64: string,
    theirPublicKeyB64: string
  ): string {
    if (!encryptedKeyB64) return '';
    if (!keyIvB64) return encryptedKeyB64;
    try {
      const sharedKey = this.computeSharedKey(myPrivateKeyB64, theirPublicKeyB64);
      const iv = base64ToUint8Array(keyIvB64);
      const cipherBytes = base64ToUint8Array(encryptedKeyB64);
      const cipher = gcm(sharedKey, iv);
      const plainBytes = cipher.decrypt(cipherBytes);
      return uint8ArrayToBase64(plainBytes);
    } catch {
      return encryptedKeyB64;
    }
  }

  /**
   * Derives a 256-bit AES key from a user password using PBKDF2-SHA256
   */
  public deriveKeyFromPassword(password: string, salt: Uint8Array): Uint8Array {
    return pbkdf2(sha256, utf8ToBytes(password), salt, { c: 10000, dkLen: 32 });
  }

  /**
   * Encrypts the user's private key with a password-derived key for safe cloud backup
   */
  public backupPrivateKey(privateKeyB64: string, password: string): EncryptedPrivateKeyBackup {
    const salt = getRandomBytes(16);
    const iv = getRandomBytes(12);
    const key = this.deriveKeyFromPassword(password, salt);
    const plainBytes = base64ToUint8Array(privateKeyB64);
    const cipher = gcm(key, iv);
    const cipherBytes = cipher.encrypt(plainBytes);
    return {
      encryptedPrivateKey: uint8ArrayToBase64(cipherBytes),
      keySalt: uint8ArrayToBase64(salt),
      keyIv: uint8ArrayToBase64(iv),
    };
  }

  /**
   * Decrypts and restores the user's private key from an encrypted cloud backup
   */
  public restorePrivateKey(
    encryptedPrivateKeyB64: string,
    password: string,
    keySaltB64: string,
    keyIvB64: string
  ): string {
    const salt = base64ToUint8Array(keySaltB64);
    const iv = base64ToUint8Array(keyIvB64);
    const key = this.deriveKeyFromPassword(password, salt);
    const cipherBytes = base64ToUint8Array(encryptedPrivateKeyB64);
    const cipher = gcm(key, iv);
    const plainBytes = cipher.decrypt(cipherBytes);
    return uint8ArrayToBase64(plainBytes);
  }
}

export default new CryptoService();
