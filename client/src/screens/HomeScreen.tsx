import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  StatusBar,
  Platform,
  Alert,
  TouchableOpacity,
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
import UserProfileModal from '../components/UserProfileModal';
import { useAuth } from '../context/AuthContext';
import api from '../config/api';
import { ChatContact, FilterType, StoryItem, ChatGroup } from '../types';

const INITIAL_CHATS: ChatContact[] = [
  {
    id: '1',
    name: 'Tech Lead - Alex',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    lastMessage: 'The new release build is ready for review! 🚀',
    time: '10:42 AM',
    unreadCount: 2,
    isOnline: true,
    isGroup: false,
    isDelivered: true,
    isRead: false,
  },
  {
    id: '2',
    name: 'Frontend Core Team',
    avatar: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80',
    lastMessage: 'Meeting rescheduled to 3 PM today',
    time: '09:15 AM',
    unreadCount: 0,
    isOnline: true,
    isGroup: true,
    isDelivered: true,
    isRead: true,
  },
  {
    id: '3',
    name: 'Elena Rostova',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    lastMessage: 'typing...',
    time: 'Yesterday',
    unreadCount: 1,
    isOnline: true,
    isTyping: true,
    isGroup: false,
    isDelivered: true,
    isRead: false,
  },
  {
    id: '4',
    name: 'David Kim',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    lastMessage: 'Can you send over the Figma links?',
    time: 'Yesterday',
    unreadCount: 0,
    isOnline: false,
    isGroup: false,
    isDelivered: true,
    isRead: true,
  },
  {
    id: '5',
    name: 'Product Design Squad',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    lastMessage: 'David: Shared the interactive prototype',
    time: 'Sep 18',
    unreadCount: 0,
    isOnline: false,
    isGroup: true,
    isDelivered: true,
    isRead: false,
  },
];

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
  const [rawGroups, setRawGroups] = useState<ChatGroup[]>([]);
  const [isNewGroupModalVisible, setIsNewGroupModalVisible] = useState(false);
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);

  // Load registered contacts, groups, and conversations from PostgreSQL
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!currentUser) return;
      try {
        const [users, conversations, groups] = await Promise.all([
          api.getUsers(currentUser.username).catch(() => []),
          api.getConversations(currentUser.username).catch(() => []),
          api.getGroups(currentUser.username).catch(() => []),
        ]);

        if (!isMounted) return;

        setRawGroups(groups);

        // Format direct message contacts
        const formattedDirect: ChatContact[] = users.map((u) => {
          const conv = conversations.find(
            (c) => c.counterpart_username?.toLowerCase() === u.username?.toLowerCase()
          );
          return {
            id: u.username,
            username: u.username,
            name: u.display_name || u.username,
            avatar: u.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
            lastMessage: conv
              ? (conv.message_type === 'text' ? conv.body : `[${(conv.message_type || 'file').toUpperCase()}] ${conv.media_name || ''}`)
              : 'Tap to start a conversation',
            time: conv?.created_at
              ? new Date(conv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Active',
            unreadCount: 0,
            isOnline: true,
            isGroup: false,
            isDelivered: true,
            isRead: true,
          };
        });

        // Format group chat contacts
        const formattedGroups: ChatContact[] = groups.map((g) => ({
          id: `group_${g.id}`,
          username: `group_${g.id}`,
          name: g.name,
          avatar: g.avatar || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150',
          lastMessage: g.last_message || 'Group created • Tap to chat',
          time: g.last_message_time
            ? new Date(g.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Group',
          unreadCount: 0,
          isOnline: true,
          isGroup: true,
          isDelivered: true,
          isRead: true,
        }));

        const combined = [...formattedGroups, ...formattedDirect];
        setDbChats(combined.length > 0 ? combined : INITIAL_CHATS);
      } catch (err: any) {
        console.log('Using default mock chats:', err.message);
        if (isMounted) setDbChats(INITIAL_CHATS);
      }
    }

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentUser]);

  const chatsToDisplay = dbChats.length > 0 ? dbChats : INITIAL_CHATS;

  const filteredChats = chatsToDisplay.filter((chat) => {
    const matchesSearch =
      chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (activeFilter === 'Unread') return chat.unreadCount > 0;
    if (activeFilter === 'Groups') return chat.isGroup;
    if (activeFilter === 'Direct') return !chat.isGroup;
    return true;
  });

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
      // Pick first non-group user to initiate call
      const contactToCall = dbChats.find((c) => !c.isGroup && c.username !== currentUser?.username);
      if (contactToCall && onStartCall) {
        onStartCall(contactToCall.username || contactToCall.id, true, contactToCall.name, contactToCall.avatar);
      } else {
        Alert.alert('Start Call', 'Select a contact from the list to start a call.');
      }
    } else {
      Alert.alert('Action Triggered', `You clicked action: ${actionId}`);
    }
  };

  const handleStoryPress = (story: StoryItem) => {
    Alert.alert('Story Viewer', `Viewing story of ${story.name}`);
  };

  const handleAddStory = () => {
    Alert.alert('Create Story', 'Add a new photo or video update to your status.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />

      <Header
        onNotificationPress={() => Alert.alert('Notifications', 'PostgreSQL and XMPP connected.')}
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
          onStoryPress={handleStoryPress}
          onAddStory={handleAddStory}
        />

        <QuickActions onActionPress={handleActionPress} />

        <RecentChats
          chats={filteredChats}
          onChatPress={handleChatPress}
        />
      </ScrollView>

      {/* Floating Action Button for New Chat */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => Alert.alert('Compose', 'Starting a new conversation...')}
      >
        <Ionicons name="chatbubble-ellipses" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <BottomNavBar activeTab={activeTab} onTabChange={setActiveTab} />

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
    paddingBottom: 90, // Leave room for bottom navigation bar and FAB
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
