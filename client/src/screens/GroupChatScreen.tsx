import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import api from '../config/api';
import cryptoService, { readAssetBytes } from '../services/cryptoService';
import callService from '../services/callService';
import MessageBubble from '../components/MessageBubble';
import { ChatGroup, GroupMessage, AttachmentAsset, MessageType } from '../types';

interface GroupChatScreenProps {
  group: ChatGroup;
  onBack: () => void;
}

export default function GroupChatScreen({ group, onBack }: GroupChatScreenProps) {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadMessages();

    // Listen for incoming real-time group broadcasts
    const handleIncomingGroupMsg = (data: any) => {
      if (data.groupId === group.id && data.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
    };

    callService.on('new-group-message', handleIncomingGroupMsg);

    return () => {
      callService.off('new-group-message', handleIncomingGroupMsg);
    };
  }, [group.id]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const history = await api.getGroupMessages(group.id);
      setMessages(history);
    } catch (err) {
      console.error('Failed to load group messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendText = async () => {
    if (!inputText.trim() || !currentUser) return;
    const body = inputText.trim();
    setInputText('');

    try {
      const saved = await api.sendGroupMessage(group.id, {
        sender: currentUser.username,
        body,
        message_type: 'text',
      });
      setMessages((prev) => [...prev, saved]);
    } catch (err: any) {
      console.error('Failed to send group message:', err);
      Alert.alert('Error', 'Could not send message.');
    }
  };

  const handlePickDocument = async () => {
    if (!currentUser) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      setUploading(true);
      setUploadStatus(`Encrypting ${asset.name}...`);

      const ext = (asset.name || '').split('.').pop()?.toLowerCase() || '';
      let msgType: MessageType = 'file';
      if (asset.mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
        msgType = 'image';
      } else if (asset.mimeType?.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
        msgType = 'video';
      } else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(ext)) {
        msgType = 'document';
      }

      // 1. Read bytes safely across Web and Mobile
      const rawBytes = await readAssetBytes(asset);

      // 2. Client-Side E2EE: Encrypt bytes with AES-GCM 256
      const { encryptedBlob, encryptedBytes, encryptionKey, encryptionIv } = await cryptoService.encryptFile(rawBytes);

      setUploadStatus('Uploading to S3...');

      // 3. Upload ciphertext to S3
      const uploaded = await api.uploadFile({
        uri: asset.uri,
        name: `${asset.name || 'file'}.enc`,
        mimeType: 'application/octet-stream',
        size: encryptedBytes.length,
        blob: encryptedBlob || undefined,
        bytes: encryptedBytes,
      });

      setUploadStatus('Broadcasting to group...');

      // 4. Save & broadcast to group members
      const saved = await api.sendGroupMessage(group.id, {
        sender: currentUser.username,
        body: '',
        message_type: msgType,
        media_url: uploaded.url,
        media_name: asset.name,
        media_size: asset.size || encryptedBytes.length,
        media_mime: asset.mimeType,
        encryption_key: encryptionKey,
        encryption_iv: encryptionIv,
      });

      setMessages((prev) => [...prev, saved]);
    } catch (err: any) {
      console.error('Group upload failed:', err);
      Alert.alert('Upload Failed', err.message || 'Could not upload file');
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 24 : 12) + 8 },
        ]}
      >
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.groupInfo}>
          <Image
            source={{
              uri:
                group.avatar ||
                'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80',
            }}
            style={styles.groupAvatar}
          />
          <View>
            <Text style={styles.groupName} numberOfLines={1}>
              {group.name}
            </Text>
            <Text style={styles.memberCountText}>
              {group.member_count ? `${group.member_count} members` : 'Group conversation'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => Alert.alert('Group Info', `${group.name}\n${group.description || 'No description'}`)}
        >
          <Ionicons name="information-circle-outline" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Messages List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="people" size={54} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>Welcome to {group.name}!</Text>
          <Text style={styles.emptySubtitle}>Be the first to say hello.</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isMe = item.sender === currentUser?.username;
            return (
              <View style={[styles.msgWrapper, isMe ? styles.msgWrapperMe : styles.msgWrapperOther]}>
                {!isMe && (
                  <Text style={styles.senderLabel}>
                    {item.sender_name || item.sender}
                  </Text>
                )}
                <MessageBubble message={item as any} isMe={isMe} />
              </View>
            );
          }}
        />
      )}

      {/* Uploading indicator */}
      {uploading && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.uploadingText}>{uploadStatus}</Text>
        </View>
      )}

      {/* Bottom Chat Input */}
      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={handlePickDocument}
          disabled={uploading}
        >
          <Ionicons name="attach" size={24} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Message group..."
          placeholderTextColor={theme.colors.textMuted}
          value={inputText}
          onChangeText={setInputText}
          multiline
        />

        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={handleSendText}
          disabled={!inputText.trim() || uploading}
        >
          <Ionicons name="send" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 12,
    paddingBottom: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  groupInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  memberCountText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  iconBtn: {
    padding: 6,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  listContent: {
    paddingVertical: 12,
  },
  msgWrapper: {
    marginVertical: 2,
  },
  msgWrapperMe: {
    alignItems: 'flex-end',
  },
  msgWrapperOther: {
    alignItems: 'flex-start',
  },
  senderLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primary,
    marginLeft: 20,
    marginBottom: 2,
  },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  uploadingText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  attachButton: {
    padding: 6,
    marginRight: 6,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 100,
    color: theme.colors.textPrimary,
  },
  sendButton: {
    backgroundColor: theme.colors.primary,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
