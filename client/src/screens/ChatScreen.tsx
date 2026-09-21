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
  Keyboard,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import api from '../config/api';
import cryptoService, { readAssetBytes } from '../services/cryptoService';
import MessageBubble from '../components/MessageBubble';
import { formatLastSeen } from '../utils/presenceUtils';
import { ChatContact, Message, AttachmentAsset, MessageType } from '../types';

interface ChatScreenProps {
  contact: ChatContact;
  onBack: () => void;
  onStartCall?: (contact: ChatContact, isVideo: boolean) => void;
}

export default function ChatScreen({ contact, onBack, onStartCall }: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isContactOnline, setIsContactOnline] = useState<boolean>(contact.isOnline ?? false);
  const [contactLastSeen, setContactLastSeen] = useState<string | null | undefined>(contact.lastSeen);
  const [hidePresence, setHidePresence] = useState<boolean>(contact.hidePresence ?? false);
  const [contactStatus, setContactStatus] = useState<string>(contact.contactStatus || 'none');
  const [initiatedBy, setInitiatedBy] = useState<string | undefined>(contact.initiatedBy);
  const flatListRef = useRef<FlatList<Message>>(null);

  // Check contact relationship and mark messages as read if accepted
  useEffect(() => {
    const contactUser = contact.username || contact.id;
    if (!currentUser || !contactUser || contact.isGroup) return;

    let isMounted = true;
    async function checkStatus() {
      try {
        const res = await api.getContactStatus(currentUser!.username, contactUser);
        if (isMounted) {
          setContactStatus(res.status);
          setInitiatedBy(res.initiated_by);

          // If accepted, immediately mark incoming messages as read
          if (res.status === 'accepted') {
            api.markMessagesRead(currentUser!.username, contactUser).catch(() => {});
          }
        }
      } catch {}
    }

    checkStatus();
    return () => {
      isMounted = false;
    };
  }, [contact, currentUser]);

  // Poll live presence of the contact
  useEffect(() => {
    const contactUser = contact.username || contact.id;
    if (!contactUser || contact.isGroup) return;

    let isMounted = true;
    async function updatePresence() {
      try {
        const pres = await api.getPresence(contactUser);
        if (isMounted) {
          setIsContactOnline(pres.isOnline);
          setContactLastSeen(pres.lastSeen);
          setHidePresence(pres.hidePresence);
        }
      } catch {}
    }

    updatePresence();
    const presInterval = setInterval(updatePresence, 5000);
    return () => {
      isMounted = false;
      clearInterval(presInterval);
    };
  }, [contact]);

  // Fetch messages from PostgreSQL
  const fetchMessages = async () => {
    if (!currentUser || !contact) return;
    try {
      const contactUser = contact.username || contact.id;
      const msgs = await api.getMessages(currentUser.username, contactUser);
      setMessages(msgs);

      // If accepted, mark messages as read
      if (contactStatus === 'accepted') {
        api.markMessagesRead(currentUser.username, contactUser).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();

    // Polling interval to simulate real-time message updates
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [contact, contactStatus]);

  // Auto-scroll to latest message when keyboard opens
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });
    return () => sub.remove();
  }, []);

  const handleAcceptContact = async () => {
    if (!currentUser) return;
    const contactUser = contact.username || contact.id;
    try {
      await api.acceptContact(currentUser.username, contactUser);
      setContactStatus('accepted');
      await api.markMessagesRead(currentUser.username, contactUser);
      fetchMessages();
      Alert.alert('Request Accepted', `${contact.name} has been added to your contacts.`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleDeleteRequest = () => {
    Alert.alert(
      'Delete Message Request?',
      'This conversation will be deleted from your inbox.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!currentUser) return;
            const contactUser = contact.username || contact.id;
            try {
              await api.deleteRequest(currentUser.username, contactUser);
              setContactStatus('declined');
              onBack();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  const handleBlockUser = () => {
    Alert.alert(
      `Block ${contactDisplayName}?`,
      'They will not be able to message or call you, and this conversation will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            if (!currentUser) return;
            const contactUser = contact.username || contact.id;
            try {
              await api.blockContact(currentUser.username, contactUser);
              setContactStatus('blocked');
              Alert.alert('User Blocked', `${contactDisplayName} has been blocked.`);
              onBack();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  const handleUnblockUser = async () => {
    if (!currentUser) return;
    const contactUser = contact.username || contact.id;
    try {
      await api.unblockContact(currentUser.username, contactUser);
      setContactStatus('none');
      Alert.alert('User Unblocked', `${contactDisplayName} has been unblocked.`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  // Send Text Message
  const handleSendText = async () => {
    if (!inputText.trim() || !currentUser) return;

    const textToSend = inputText.trim();
    const contactUser = contact.username || contact.id;
    setInputText('');

    // Optimistic message
    const tempMsg: Message = {
      id: Date.now(),
      sender: currentUser.username,
      recipient: contactUser,
      body: textToSend,
      message_type: 'text',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const saved = await api.sendMessage({
        sender: currentUser.username,
        recipient: contactUser,
        body: textToSend,
        message_type: 'text',
      });
      // Replace with saved message from PostgreSQL
      setMessages((prev) =>
        prev.map((m) => (m.id === tempMsg.id ? saved : m))
      );
    } catch (err) {
      console.error('Failed to save message:', err);
      Alert.alert('Error', 'Could not send message. Please try again.');
    }
  };

  // Pick, Encrypt (AES-GCM 256), and Send Attachment
  const handlePickDocument = async () => {
    if (!currentUser) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setUploading(true);
      setUploadStatus(`Encrypting ${asset.name}...`);

      // Determine true message type from original name & mime
      const ext = (asset.name || '').split('.').pop()?.toLowerCase() || '';
      let msgType: MessageType = 'file';
      if (asset.mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
        msgType = 'image';
      } else if (asset.mimeType?.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
        msgType = 'video';
      } else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(ext)) {
        msgType = 'document';
      }

      // 1. Read raw file bytes safely across Web and Mobile
      const rawBytes = await readAssetBytes(asset);

      // 2. Client-Side E2EE: Encrypt bytes with AES-GCM 256
      const { encryptedBlob, encryptedBytes, encryptionKey, encryptionIv } = await cryptoService.encryptFile(rawBytes);

      setUploadStatus(`Uploading encrypted data to S3...`);

      // 3. Upload ciphertext to S3 (S3 only ever sees encrypted noise)
      const uploaded = await api.uploadFile({
        uri: asset.uri,
        name: `${asset.name || 'file'}.enc`,
        mimeType: 'application/octet-stream',
        size: encryptedBytes.length,
        blob: encryptedBlob || undefined,
        bytes: encryptedBytes,
      });

      setUploadStatus('Securing conversation...');

      const contactUser = contact.username || contact.id;

      // 4. Save message with S3 media URL and encryption keys
      const saved = await api.sendMessage({
        sender: currentUser.username,
        recipient: contactUser,
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
      console.error('E2EE Upload failed:', err);
      Alert.alert('Upload Failed', err.message || 'Could not encrypt or upload file');
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
  };

  const contactDisplayName = contact.display_name || contact.name || contact.username || 'User';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      style={styles.container}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 24 : 12) + 8 }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.avatarContainer}>
          <Image
            source={{ uri: contact.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150' }}
            style={styles.avatar}
          />
          {isContactOnline && !hidePresence && <View style={styles.onlineDot} />}
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.contactName} numberOfLines={1}>
            {contactDisplayName}
          </Text>
          {hidePresence ? (
            <Text style={styles.offlineStatus}>Offline</Text>
          ) : isContactOnline ? (
            <Text style={styles.activeNowStatus}>Active now</Text>
          ) : (
            <Text style={styles.offlineStatus}>
              {formatLastSeen(contactLastSeen)}
            </Text>
          )}
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onStartCall?.(contact, false)}
          >
            <Ionicons name="call-outline" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onStartCall?.(contact, true)}
          >
            <Ionicons name="videocam-outline" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 1. Incoming Message Request Banner (Recipient View) */}
      {!contact.isGroup && contactStatus === 'pending' && initiatedBy?.toLowerCase() !== currentUser?.username?.toLowerCase() && (
        <View style={styles.requestBanner}>
          <View style={styles.requestBannerContent}>
            <Ionicons name="mail-unread-outline" size={24} color={theme.colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.requestBannerTitle}>Message Request</Text>
              <Text style={styles.requestBannerSub}>
                {contactDisplayName} is not in your contacts. Read receipts will not be shared until you accept.
              </Text>
            </View>
          </View>
          <View style={styles.requestBannerButtons}>
            <TouchableOpacity style={styles.bannerBlockBtn} onPress={handleBlockUser}>
              <Ionicons name="ban-outline" size={14} color="#EF4444" style={{ marginRight: 4 }} />
              <Text style={styles.bannerBlockText}>Block</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bannerDeleteBtn} onPress={handleDeleteRequest}>
              <Ionicons name="trash-outline" size={14} color={theme.colors.textSecondary} style={{ marginRight: 4 }} />
              <Text style={styles.bannerDeleteText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bannerAcceptBtn} onPress={handleAcceptContact}>
              <Text style={styles.bannerAcceptText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 2. Blocked User Banner */}
      {!contact.isGroup && contactStatus === 'blocked' && (
        <View style={styles.blockedBanner}>
          <Ionicons name="ban" size={18} color="#EF4444" />
          <Text style={styles.blockedBannerText}>You have blocked this contact.</Text>
          <TouchableOpacity style={styles.unblockBtn} onPress={handleUnblockUser}>
            <Text style={styles.unblockBtnText}>Unblock</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 3. Outgoing Message Request Banner (Sender View) */}
      {!contact.isGroup && contactStatus === 'pending' && initiatedBy?.toLowerCase() === currentUser?.username?.toLowerCase() && (
        <View style={styles.senderPendingBanner}>
          <Ionicons name="time-outline" size={18} color="#F59E0B" />
          <Text style={styles.senderPendingText}>
            Message request sent. Read receipts will appear once {contactDisplayName} accepts.
          </Text>
        </View>
      )}

      {/* Uploading Banner */}
      {uploading && (
        <View style={styles.uploadBanner}>
          <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.uploadBannerText}>{uploadStatus}</Text>
        </View>
      )}

      {/* Messages List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isMe={item.sender?.toLowerCase() === currentUser?.username?.toLowerCase()}
            />
          )}
          contentContainerStyle={styles.messagesList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="chatbox-ellipses-outline" size={32} color={theme.colors.primary} />
              </View>
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubText}>
                Send a message, photo, video, PDF, Word, Excel, or ZIP to start chatting!
              </Text>
            </View>
          }
        />
      )}

      {/* Input Bar */}
      {contactStatus === 'blocked' ? (
        <View style={styles.blockedInputContainer}>
          <Ionicons name="lock-closed-outline" size={16} color={theme.colors.textMuted} style={{ marginRight: 8 }} />
          <Text style={styles.blockedInputText}>You have blocked this contact. Unblock to send messages.</Text>
        </View>
      ) : (
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {/* Attachment Button */}
          <TouchableOpacity
            style={styles.attachButton}
            onPress={handlePickDocument}
            disabled={uploading}
          >
            <Ionicons name="attach" size={24} color={theme.colors.primary} />
          </TouchableOpacity>

          {/* Text Input */}
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor={theme.colors.textTertiary}
            value={inputText}
            onChangeText={setInputText}
            onFocus={() => {
              setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
              }, 150);
            }}
            multiline
            maxLength={1000}
          />

          {/* Send Button */}
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={handleSendText}
            disabled={!inputText.trim()}
          >
            <Ionicons name="arrow-up" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 44 : 14,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: 6,
    marginRight: 4,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.online,
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 10,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  activeNowStatus: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
    marginTop: 1,
  },
  offlineStatus: {
    fontSize: 12,
    color: theme.colors.textMuted || '#94A3B8',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    padding: 6,
  },
  uploadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  uploadBannerText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesList: {
    paddingVertical: 14,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    marginTop: 60,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  emptySubText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  attachButton: {
    padding: 8,
    marginRight: 4,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 15,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  requestBanner: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    padding: 12,
  },
  requestBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requestBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  requestBannerSub: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  requestBannerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  bannerAcceptBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  bannerAcceptText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  bannerDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  bannerDeleteText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  bannerBlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  bannerBlockText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.2)',
    justifyContent: 'space-between',
  },
  blockedBannerText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '600',
  },
  unblockBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  unblockBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  blockedInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  blockedInputText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  senderPendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 158, 11, 0.2)',
  },
  senderPendingText: {
    flex: 1,
    fontSize: 12,
    color: '#D97706',
    lineHeight: 16,
  },
});
