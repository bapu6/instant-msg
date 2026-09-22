import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { theme } from '../theme/theme';
import { Message } from '../types';
import { useAuth } from '../context/AuthContext';
import cryptoService, { uint8ArrayToBase64, base64ToUint8Array } from '../services/cryptoService';
import { API_BASE_URL } from '../config/api';

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function normalizeMediaUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('/')) {
    return `${API_BASE_URL.replace(/\/+$/, '')}${url}`;
  }
  // If running on mobile and URL points to localhost/127.0.0.1, map to backend host
  if (Platform.OS !== 'web' && (url.includes('localhost') || url.includes('127.0.0.1'))) {
    try {
      const parsed = new URL(url);
      const baseParsed = new URL(API_BASE_URL);
      parsed.protocol = baseParsed.protocol;
      parsed.host = baseParsed.host;
      return parsed.toString();
    } catch {
      return url.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, API_BASE_URL.replace(/\/+$/, ''));
    }
  }
  return url;
}

async function fetchMediaArrayBuffer(mediaUrl: string): Promise<ArrayBuffer> {
  const normalized = normalizeMediaUrl(mediaUrl);

  // 1. Direct attempt
  try {
    const res = await fetch(normalized);
    if (res.ok) {
      return await res.arrayBuffer();
    }
  } catch (e) {
    // S3 CORS or direct network failure
  }

  // 2. Fallback attempt via backend proxy stream
  const filename = mediaUrl.split('/').pop() || '';
  if (filename) {
    const proxyUrl = `${API_BASE_URL}/api/files/${encodeURIComponent(filename)}`;
    try {
      const proxyRes = await fetch(proxyUrl);
      if (proxyRes.ok) {
        return await proxyRes.arrayBuffer();
      }
    } catch (e) {
      // proxy failure
    }
  }

  throw new Error(`Unable to download file data from storage or proxy (${filename})`);
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
    } catch {}
    URL.revokeObjectURL(downloadUrl);
  }, 10000);
}

function getMimeType(filename: string, fallback?: string | null): string {
  if (fallback && fallback !== 'application/octet-stream') return fallback;
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/m4a',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
  };
  return map[ext] || fallback || 'application/octet-stream';
}

async function saveAndOpenMobileFile(
  plainBytes: Uint8Array,
  filename: string,
  mimeType?: string | null
): Promise<void> {
  const safeName = (filename || `download_${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const resolvedMime = getMimeType(safeName, mimeType);

  let fileUri = '';

  // 1. Write decrypted bytes to local cache
  try {
    const localFile = new File(Paths.cache, safeName);
    localFile.create({ overwrite: true });
    localFile.write(plainBytes);
    fileUri = localFile.uri;
  } catch {
    try {
      const FileSystemLegacy = require('expo-file-system/legacy');
      const base64Data = uint8ArrayToBase64(plainBytes);
      fileUri = `${FileSystemLegacy.cacheDirectory}${safeName}`;
      await FileSystemLegacy.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystemLegacy.EncodingType.Base64,
      });
    } catch (legacyErr: any) {
      console.error('Mobile save failed:', legacyErr);
      throw new Error(`Could not save file to device: ${legacyErr.message}`);
    }
  }

  // 2. On Android: Open file directly in default application via IntentLauncher
  if (Platform.OS === 'android') {
    try {
      const FileSystemLegacy = require('expo-file-system/legacy');
      const contentUri = await FileSystemLegacy.getContentUriAsync(fileUri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: resolvedMime,
      });
      return;
    } catch (intentErr) {
      console.warn('Direct Android open intent failed, falling back to share:', intentErr);
    }
  }

  // 3. Fallback for iOS or if Android intent could not find default viewer
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: resolvedMime,
      dialogTitle: `Open ${safeName}`,
      UTI: resolvedMime,
    });
  } else {
    Alert.alert('Decrypted & Saved', `File saved to ${fileUri}`);
  }
}

interface FileIconInfo {
  icon: any;
  color: string;
  label: string;
}

function getFileIconAndColor(filename?: string | null): FileIconInfo {
  if (!filename) return { icon: 'document-text', color: '#6366F1', label: 'FILE' };
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (['pdf'].includes(ext)) {
    return { icon: 'document-text', color: '#EF4444', label: 'PDF' };
  }
  if (['doc', 'docx'].includes(ext)) {
    return { icon: 'document', color: '#2563EB', label: 'DOC' };
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return { icon: 'grid', color: '#10B981', label: 'EXCEL' };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { icon: 'archive', color: '#F59E0B', label: 'ARCHIVE' };
  }
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) {
    return { icon: 'videocam', color: '#8B5CF6', label: 'VIDEO' };
  }
  return { icon: 'document-attach', color: '#6B7280', label: ext.toUpperCase() };
}

interface MessageBubbleProps {
  message: Message;
  isMe: boolean;
}

export default function MessageBubble({ message, isMe }: MessageBubbleProps) {
  const { currentUser } = useAuth();
  const {
    body,
    message_type = 'text',
    media_url,
    media_name,
    media_size,
    media_mime,
    encryption_key,
    encryption_iv,
    created_at,
  } = message;

  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState<boolean>(false);

  const isEncrypted = Boolean(encryption_key && encryption_iv);

  const resolvePlainMediaKey = (): string | null => {
    if (!encryption_key) return null;
    try {
      const raw = base64ToUint8Array(encryption_key);
      if (raw.length === 32) {
        return encryption_key;
      }
    } catch {}

    // If key length is not 32, it's an encrypted media key payload.
    // Try decrypting with ECDH shared secret if private key is available
    if (currentUser?.private_key) {
      try {
        const decrypted = cryptoService.decryptMediaKey(
          encryption_key,
          encryption_iv,
          currentUser.private_key,
          currentUser.public_key || ''
        );
        return decrypted;
      } catch (e) {
        console.warn('ECDH media key decryption fallback failed:', e);
      }
    }
    return encryption_key;
  };

  // Auto-decrypt images in client memory for direct visual rendering
  useEffect(() => {
    let active = true;
    const plainKey = resolvePlainMediaKey();
    if (message_type === 'image' && media_url && isEncrypted && plainKey && encryption_iv) {
      setDecrypting(true);
      (async () => {
        try {
          const cipherBuffer = await fetchMediaArrayBuffer(media_url);
          const plainBuffer = await cryptoService.decryptFile(
            cipherBuffer,
            plainKey,
            encryption_iv
          );
          if (active) {
            if (Platform.OS === 'web') {
              const blob = new Blob([plainBuffer as any], { type: media_mime || 'image/jpeg' });
              const localUrl = URL.createObjectURL(blob);
              setDecryptedUrl(localUrl);
            } else {
              // Mobile (Android / iOS): Write to cache and use file URI
              const safeName = (media_name || `img_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
              try {
                const localFile = new File(Paths.cache, safeName);
                localFile.create({ overwrite: true });
                localFile.write(plainBuffer);
                setDecryptedUrl(localFile.uri);
              } catch {
                const FileSystemLegacy = require('expo-file-system/legacy');
                const base64Data = uint8ArrayToBase64(plainBuffer);
                const targetUri = `${FileSystemLegacy.cacheDirectory}${safeName}`;
                await FileSystemLegacy.writeAsStringAsync(targetUri, base64Data, {
                  encoding: FileSystemLegacy.EncodingType.Base64,
                });
                setDecryptedUrl(targetUri);
              }
            }
          }
        } catch (err) {
          console.error('Failed to decrypt image:', err);
        } finally {
          if (active) setDecrypting(false);
        }
      })();
    }

    return () => {
      active = false;
      if (decryptedUrl && Platform.OS === 'web') {
        URL.revokeObjectURL(decryptedUrl);
      }
    };
  }, [media_url, encryption_key, encryption_iv]);

  const timeStr = created_at
    ? new Date(created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const handleOpenMedia = async () => {
    if (!media_url) return;
    const plainKey = resolvePlainMediaKey();

    if (isEncrypted && plainKey && encryption_iv) {
      try {
        setDecrypting(true);
        const cipherBuffer = await fetchMediaArrayBuffer(media_url);
        const plainBuffer = await cryptoService.decryptFile(
          cipherBuffer,
          plainKey,
          encryption_iv
        );

        if (Platform.OS === 'web') {
          const blob = new Blob([plainBuffer as any], { type: media_mime || 'application/octet-stream' });
          triggerBrowserDownload(blob, media_name || 'download');
        } else {
          await saveAndOpenMobileFile(plainBuffer, media_name || 'download', media_mime);
        }
      } catch (err: any) {
        console.error('Decryption failed:', err);
        Alert.alert('Decryption Error', err.message || 'Could not decrypt file with provided keys.');
      } finally {
        setDecrypting(false);
      }
    } else {
      // Legacy unencrypted download / open
      try {
        setDecrypting(true);
        const buffer = await fetchMediaArrayBuffer(media_url);
        const blob = new Blob([buffer], { type: media_mime || 'application/octet-stream' });
        if (Platform.OS === 'web') {
          triggerBrowserDownload(blob, media_name || 'download');
        } else {
          await saveAndOpenMobileFile(new Uint8Array(buffer), media_name || 'download', media_mime);
        }
      } catch {
        if (Platform.OS === 'web') {
          window.open(media_url, '_blank');
        } else {
          Linking.openURL(media_url).catch((err) => console.error('Failed to open URL:', err));
        }
      } finally {
        setDecrypting(false);
      }
    }
  };

  const fileInfo = getFileIconAndColor(media_name);

  return (
    <View style={[styles.container, isMe ? styles.containerMe : styles.containerOther]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
        {/* 1. Image Attachment */}
        {Boolean(message_type === 'image' && media_url) && (
          <TouchableOpacity activeOpacity={0.9} onPress={handleOpenMedia} style={styles.imageContainer}>
            {decrypting && !decryptedUrl ? (
              <View style={[styles.attachedImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000020' }]}>
                <ActivityIndicator size="small" color={isMe ? '#FFF' : theme.colors.primary} />
                <Text style={{ fontSize: 11, color: isMe ? '#FFF' : theme.colors.textSecondary, marginTop: 4 }}>Decrypting E2EE...</Text>
              </View>
            ) : (
              <Image
                source={{ uri: decryptedUrl || media_url || undefined }}
                style={styles.attachedImage}
                resizeMode="cover"
              />
            )}
            {Boolean(isEncrypted) && (
              <View style={styles.e2eeBadge}>
                <Ionicons name="lock-closed" size={10} color="#FFF" />
                <Text style={styles.e2eeBadgeText}>E2EE</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* 2. Video Attachment */}
        {Boolean(message_type === 'video' && media_url) && (
          <TouchableOpacity activeOpacity={0.85} onPress={handleOpenMedia} style={styles.videoCard}>
            <View style={styles.videoPreview}>
              <View style={styles.playButton}>
                <Ionicons name="play" size={24} color="#FFF" style={{ marginLeft: 2 }} />
              </View>
            </View>
            <View style={styles.videoInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.fileName, isMe ? styles.textMe : styles.textOther]} numberOfLines={1}>
                  {media_name || 'Video attachment'}
                </Text>
                {Boolean(isEncrypted) && (
                  <View style={[styles.e2eeInlineBadge, { marginLeft: 6 }]}>
                    <Ionicons name="lock-closed" size={10} color="#FFF" />
                  </View>
                )}
              </View>
              {Boolean(media_size) && (
                <Text style={[styles.fileSize, isMe ? styles.metaMe : styles.metaOther]}>
                  {formatBytes(media_size)}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* 3. Document / File Attachment (PDF, Word, Excel, ZIP) */}
        {Boolean((message_type === 'document' || message_type === 'file') && media_url) && (
          <TouchableOpacity activeOpacity={0.85} onPress={handleOpenMedia} style={styles.docCard}>
            <View style={[styles.fileBadge, { backgroundColor: fileInfo.color }]}>
              <Ionicons name={fileInfo.icon} size={22} color="#FFF" />
              <Text style={styles.badgeText}>{fileInfo.label}</Text>
            </View>
            <View style={styles.docDetails}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.docName, isMe ? styles.textMe : styles.textOther]} numberOfLines={2}>
                  {media_name || 'Attached file'}
                </Text>
                {Boolean(isEncrypted) && (
                  <View style={[styles.e2eeInlineBadge, { marginLeft: 6 }]}>
                    <Ionicons name="lock-closed" size={10} color="#FFF" />
                    <Text style={{ fontSize: 9, color: '#FFF', fontWeight: '700', marginLeft: 2 }}>E2EE</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.docSize, isMe ? styles.metaMe : styles.metaOther]}>
                {decrypting ? 'Decrypting...' : `${formatBytes(media_size)} • Tap to download`}
              </Text>
            </View>
            <View style={styles.downloadIcon}>
              {decrypting ? (
                <ActivityIndicator size="small" color={isMe ? '#FFF' : theme.colors.primary} />
              ) : (
                <Ionicons name="arrow-down-circle-outline" size={24} color={isMe ? '#FFF' : theme.colors.primary} />
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* Text Body */}
        {Boolean(body && body.trim().length > 0) && (
          <Text style={[styles.messageText, isMe ? styles.textMe : styles.textOther]}>
            {body}
          </Text>
        )}

        {/* Metadata: Timestamp & Status */}
        <View style={styles.metaRow}>
          <Text style={[styles.timestamp, isMe ? styles.metaMe : styles.metaOther]}>
            {timeStr}
          </Text>
          {Boolean(isMe) && (
            <Ionicons
              name={message.is_read || message.is_delivered ? 'checkmark-done' : 'checkmark'}
              size={15}
              color={message.is_read ? '#38BDF8' : 'rgba(255, 255, 255, 0.7)'}
              style={{ marginLeft: 4 }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  containerMe: {
    justifyContent: 'flex-end',
  },
  containerOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleMe: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  textMe: {
    color: '#FFFFFF',
  },
  textOther: {
    color: theme.colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  timestamp: {
    fontSize: 11,
  },
  metaMe: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  metaOther: {
    color: theme.colors.textTertiary,
  },
  imageContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 6,
  },
  attachedImage: {
    width: 240,
    height: 180,
    borderRadius: 12,
  },
  videoCard: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 6,
    width: 240,
  },
  videoPreview: {
    height: 130,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  playButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoInfo: {
    marginTop: 6,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
  },
  fileSize: {
    fontSize: 11,
    marginTop: 2,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    minWidth: 220,
    maxWidth: 280,
  },
  fileBadge: {
    width: 44,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  docDetails: {
    flex: 1,
    marginLeft: 10,
  },
  docName: {
    fontSize: 13,
    fontWeight: '600',
  },
  docSize: {
    fontSize: 11,
    marginTop: 2,
  },
  downloadIcon: {
    marginLeft: 6,
  },
  e2eeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  e2eeBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
  e2eeInlineBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
