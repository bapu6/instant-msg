import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';
import Header from '../components/Header';
import SearchBar from '../components/SearchBar';
import StoriesBar from '../components/StoriesBar';
import QuickActions from '../components/QuickActions';
import RecentChats from '../components/RecentChats';
import BottomNavBar from '../components/BottomNavBar';
import NewGroupModal from '../components/NewGroupModal';
import NewChatModal from '../components/NewChatModal';
import UserProfileModal from '../components/UserProfileModal';
import { useAuth } from '../context/AuthContext';
import api from '../config/api';
import cryptoService from '../services/cryptoService';
import { ChatContact, FilterType, StoryItem, ChatGroup, PendingRequestItem } from '../types';

interface HomeScreenProps {
  onSelectChat?: (chat: ChatContact) => void;
  onSelectGroup?: (group: ChatGroup) => void;
  onStartCall?: (targetUser: string, isVideo: boolean, name?: string, avatar?: string) => void;
}

export default function HomeScreen({ onSelectChat, onSelectGroup, onStartCall }: HomeScreenProps) {
  const { currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');
  const [activeTab, setActiveTab] = useState<string>('chats');
  const [dbChats, setDbChats] = useState<ChatContact[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequestItem[]>([]);
  const [rawGroups, setRawGroups] = useState<ChatGroup[]>([]);
  const [isNewGroupModalVisible, setIsNewGroupModalVisible] = useState(false);
  const [isNewChatModalVisible, setIsNewChatModalVisible] = useState(false);
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  const [showRequestsList, setShowRequestsList] = useState(false);

  // Load registered contacts, groups, and conversations from PostgreSQL
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!currentUser) return;
      try {
        const [conversations, contacts, groups, requests] = await Promise.all([
          api.getConversations(currentUser.username).catch(() => []),
          api.getContacts(currentUser.username).catch(() => []),
          api.getGroups(currentUser.username).catch(() => []),
          api.getPendingRequests(currentUser.username).catch(() => []),
        ]);

        if (!isMounted) return;

        setRawGroups(groups);
        setPendingRequests(requests);

        // 1. Map existing conversations
        const directChats: ChatContact[] = conversations.map((conv) => {
          const contactStatus = conv.contact_status || 'none';
          const unread = conv.unread_count || 0;

          let lastMsg = conv.body || '';
          if (conv.message_type === 'text') {
            if (conv.body && conv.encryption_iv && conv.counterpart_public_key && currentUser?.private_key) {
              lastMsg = cryptoService.decryptTextMessage(
                conv.body,
                conv.encryption_iv,
                currentUser.private_key,
                conv.counterpart_public_key
              );
            }
          } else {
            lastMsg = `[${(conv.message_type || 'file').toUpperCase()}] ${conv.media_name || ''}`;
          }

          return {
            id: conv.counterpart_username,
            username: conv.counterpart_username,
            name: conv.counterpart_name || conv.counterpart_username,
            avatar: conv.counterpart_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
            lastMessage: lastMsg,
            time: conv.created_at
              ? new Date(conv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Active',
            timestamp: conv.created_at ? new Date(conv.created_at).getTime() : 0,
            unreadCount: unread,
            isOnline: false,
            isGroup: false,
            contactStatus: contactStatus as any,
            initiatedBy: conv.initiated_by || undefined,
            isDelivered: Boolean(conv.is_delivered),
            isRead: Boolean(conv.is_read),
            publicKey: conv.counterpart_public_key,
            encryptionIv: conv.encryption_iv,
            encryptionKey: conv.encryption_key,
          };
        });

        // 2. Add confirmed contacts who don't have conversations yet
        for (const contact of contacts) {
          const alreadyInChats = directChats.some(
            (c) => c.username?.toLowerCase() === contact.contact_username?.toLowerCase()
          );
          if (!alreadyInChats) {
            directChats.push({
              id: contact.contact_username,
              username: contact.contact_username,
              name: contact.display_name || contact.contact_username,
              avatar: contact.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
              lastMessage: 'Tap to start a conversation',
              time: 'Contact',
              timestamp: 0,
              unreadCount: 0,
              isOnline: Boolean(contact.is_online && !contact.hide_presence),
              lastSeen: contact.last_seen,
              hidePresence: Boolean(contact.hide_presence),
              isGroup: false,
              contactStatus: 'accepted',
              isDelivered: false,
              isRead: false,
            });
          }
        }

        // 3. Format group chat contacts
        const formattedGroups: ChatContact[] = groups.map((g) => ({
          id: `group_${g.id}`,
          username: `group_${g.id}`,
          name: g.name,
          avatar: g.avatar || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150',
          lastMessage: g.last_message || 'Group created • Tap to chat',
          time: g.last_message_time
            ? new Date(g.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Group',
          timestamp: g.last_message_time ? new Date(g.last_message_time).getTime() : 0,
          unreadCount: 0,
          isOnline: true,
          isGroup: true,
          isDelivered: true,
          isRead: true,
        }));

        // 4. Combine and bring unread messages to the TOP of the contact list
        const combined = [...formattedGroups, ...directChats];
        combined.sort((a, b) => {
          const aHasUnread = (a.unreadCount && a.unreadCount > 0) ? 1 : 0;
          const bHasUnread = (b.unreadCount && b.unreadCount > 0) ? 1 : 0;
          if (aHasUnread !== bHasUnread) {
            return bHasUnread - aHasUnread; // unread first
          }
          return (b.timestamp || 0) - (a.timestamp || 0); // then latest first
        });

        setDbChats(combined);
      } catch (err: any) {
        console.log('Error loading home data:', err.message);
      }
    }

    loadData();
    const interval = setInterval(loadData, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentUser]);

  const filteredChats = dbChats.filter((chat) => {
    const matchesSearch =
      chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (activeFilter === 'Unread') return chat.unreadCount > 0;
    if (activeFilter === 'Groups') return chat.isGroup;
    if (activeFilter === 'Direct') return !chat.isGroup;
    return true;
  });

  const totalUnreadCount = dbChats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);

  const handleChatPress = (chat: ChatContact) => {
    if (chat.isGroup) {
      const groupId = parseInt(chat.id.replace('group_', ''), 10);
      const group = rawGroups.find((g) => g.id === groupId);
      if (group && onSelectGroup) {
        onSelectGroup(group);
        return;
      }
    }

    if (onSelectChat) {
      onSelectChat(chat);
    } else {
      Alert.alert('Chat Selected', `Opening conversation with ${chat.name}`);
    }
  };

  const handleActionPress = (actionId: string) => {
    if (actionId === 'new_group') {
      setIsNewGroupModalVisible(true);
    } else if (actionId === 'calls') {
      const contactToCall = dbChats.find((c) => !c.isGroup && c.username !== currentUser?.username);
      if (contactToCall && onStartCall) {
        onStartCall(contactToCall.username || contactToCall.id, true, contactToCall.name, contactToCall.avatar);
      } else {
        Alert.alert('Start Call', 'Select a contact from the list or tap + to start a call.');
      }
    } else {
      setIsNewChatModalVisible(true);
    }
  };

  const handleAcceptRequest = async (req: PendingRequestItem) => {
    if (!currentUser) return;
    try {
      await api.acceptContact(currentUser.username, req.username);
      setPendingRequests((prev) => prev.filter((r) => r.id !== req.id));
      Alert.alert('Accepted', `You and ${req.display_name} are now mutual contacts!`);
      // Open the chat
      if (onSelectChat) {
        onSelectChat({
          id: req.username,
          username: req.username,
          name: req.display_name,
          avatar: req.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
          lastMessage: req.last_message || 'Message request accepted',
          time: 'Just now',
          unreadCount: 0,
          isOnline: false,
          isGroup: false,
          contactStatus: 'accepted',
        });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleDeleteRequest = (req: PendingRequestItem) => {
    Alert.alert(
      'Delete Request?',
      `Delete message request from ${req.display_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!currentUser) return;
            try {
              await api.deleteRequest(currentUser.username, req.username);
              setPendingRequests((prev) => prev.filter((r) => r.id !== req.id));
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  const handleBlockRequest = (req: PendingRequestItem) => {
    Alert.alert(
      `Block ${req.display_name}?`,
      'They will not be able to message or call you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            if (!currentUser) return;
            try {
              await api.blockContact(currentUser.username, req.username);
              setPendingRequests((prev) => prev.filter((r) => r.id !== req.id));
              Alert.alert('User Blocked', `${req.display_name} has been blocked.`);
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />

      <Header
        onNotificationPress={() => Alert.alert('Status', 'Connected to secure messaging')}
        onProfilePress={() => setIsProfileModalVisible(true)}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SearchBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilter={activeFilter}
          onSelectFilter={setActiveFilter}
        />

        <StoriesBar
          onStoryPress={(s) => Alert.alert('Story', `Viewing status of ${s.name}`)}
          onAddStory={() => Alert.alert('Create Story', 'Status updates coming soon.')}
        />

        <QuickActions onActionPress={handleActionPress} />

        {/* Incoming Message Requests Banner */}
        {pendingRequests.length > 0 && (
          <View style={styles.requestsContainer}>
            <TouchableOpacity
              style={styles.requestsHeader}
              activeOpacity={0.8}
              onPress={() => setShowRequestsList((prev) => !prev)}
            >
              <View style={styles.requestsHeaderLeft}>
                <View style={styles.requestBadge}>
                  <Ionicons name="mail-unread" size={16} color="#FFF" />
                </View>
                <View>
                  <Text style={styles.requestsTitle}>
                    Message Requests ({pendingRequests.length})
                  </Text>
                  <Text style={styles.requestsSub}>
                    {pendingRequests.length === 1
                      ? `${pendingRequests[0].display_name} sent you a message`
                      : `${pendingRequests[0].display_name} and ${pendingRequests.length - 1} other`}
                  </Text>
                </View>
              </View>
              <Ionicons
                name={showRequestsList ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={theme.colors.textMuted}
              />
            </TouchableOpacity>

            {/* Expanded List of Requests */}
            {showRequestsList && (
              <View style={styles.requestsList}>
                {pendingRequests.map((req) => (
                  <View key={req.id} style={styles.requestItem}>
                    <Image
                      source={{
                        uri: req.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
                      }}
                      style={styles.requestAvatar}
                    />
                    <View style={styles.requestDetails}>
                      <Text style={styles.requestName}>{req.display_name}</Text>
                      <Text style={styles.requestHandle}>@{req.username}</Text>
                      {Boolean(req.last_message) && (
                        <Text style={styles.requestMessage} numberOfLines={1}>
                          "{req.last_message}"
                        </Text>
                      )}
                    </View>
                    <View style={styles.requestActions}>
                      <TouchableOpacity
                        style={styles.blockBtn}
                        onPress={() => handleBlockRequest(req)}
                      >
                        <Ionicons name="ban-outline" size={16} color="#EF4444" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteRequest(req)}
                      >
                        <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => handleAcceptRequest(req)}
                      >
                        <Text style={styles.acceptBtnText}>Accept</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <RecentChats
          chats={filteredChats}
          onChatPress={handleChatPress}
        />
      </ScrollView>

      {/* Floating Action Button for New Chat */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => setIsNewChatModalVisible(true)}
      >
        <Ionicons name="chatbubble-ellipses" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <BottomNavBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        unreadChatsCount={totalUnreadCount}
      />

      <NewGroupModal
        visible={isNewGroupModalVisible}
        onClose={() => setIsNewGroupModalVisible(false)}
        currentUsername={currentUser?.username || ''}
        onGroupCreated={(newGroup) => {
          if (onSelectGroup) {
            onSelectGroup(newGroup);
          }
        }}
      />

      <NewChatModal
        visible={isNewChatModalVisible}
        onClose={() => setIsNewChatModalVisible(false)}
        onSelectUser={(contact) => {
          if (onSelectChat) {
            onSelectChat(contact);
          }
        }}
      />

      <UserProfileModal
        visible={isProfileModalVisible}
        onClose={() => setIsProfileModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 90,
  },
  requestsContainer: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    overflow: 'hidden',
  },
  requestsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  requestsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  requestBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  requestsSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  requestsList: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingVertical: 4,
  },
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  requestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceLight,
  },
  requestDetails: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  requestName: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  requestHandle: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  requestMessage: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  acceptBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  acceptBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  blockBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 6,
    borderRadius: 8,
  },
  deleteBtn: {
    backgroundColor: theme.colors.surfaceLight,
    padding: 6,
    borderRadius: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.floating,
    zIndex: 10,
  },
});
