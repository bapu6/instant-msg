import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { theme } from '../theme/theme';
import { SearchedUser, ChatContact } from '../types';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';

interface NewChatModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectUser: (contact: ChatContact) => void;
}

export default function NewChatModal({ visible, onClose, onSelectUser }: NewChatModalProps) {
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<any>(null);

  useEffect(() => {
    if (!visible) {
      setSearchQuery('');
      setSearchResults([]);
      setLoading(false);
    }
  }, [visible]);

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!text.trim()) {
      setSearchResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceTimer.current = setTimeout(async () => {
      if (!currentUser) return;
      try {
        const results = await api.searchUsers(text.trim(), currentUser.username);
        setSearchResults(results);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  const handlePickUser = (user: SearchedUser) => {
    const contact: ChatContact = {
      id: user.username,
      username: user.username,
      name: user.display_name || user.username,
      avatar: user.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      lastMessage: user.contact_status === 'pending' ? 'Message request pending' : 'Start conversation',
      time: 'Now',
      unreadCount: 0,
      isOnline: Boolean(user.is_online && !user.hide_presence),
      lastSeen: user.last_seen,
      hidePresence: Boolean(user.hide_presence),
      isGroup: false,
      contactStatus: user.contact_status ? (user.contact_status as any) : 'none',
      phoneNumber: user.phone_number,
      email: user.email,
    };

    onSelectUser(contact);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View
        style={[
          styles.safeArea,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 36 : 16),
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <StatusBar style="dark" />
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>New Conversation</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={theme.colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by phone, email, or username..."
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={handleSearch}
            autoFocus={true}
            autoCapitalize="none"
          />
          {Boolean(searchQuery) && (
            <TouchableOpacity onPress={() => handleSearch('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Info Note */}
        <View style={styles.infoBanner}>
          <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.infoText}>
            Contacts are private. If they aren't in your contacts, your first message is sent as a Message Request.
          </Text>
        </View>

        {/* Results List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Searching users...</Text>
          </View>
        ) : searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.username}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.userRow}
                activeOpacity={0.7}
                onPress={() => handlePickUser(item)}
              >
                <Avatar uri={item.avatar} name={item.display_name || item.username} size={44} style={styles.avatar} />
                <View style={styles.userInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.displayName}>{item.display_name || item.username}</Text>
                    {item.contact_status === 'accepted' && (
                      <View style={styles.statusBadgeAccepted}>
                        <Text style={styles.badgeTextAccepted}>Contact</Text>
                      </View>
                    )}
                    {item.contact_status === 'pending' && (
                      <View style={styles.statusBadgePending}>
                        <Text style={styles.badgeTextPending}>Pending</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.handle}>@{item.username}</Text>
                  {Boolean(item.phone_number) && (
                    <Text style={styles.contactDetail}>{item.phone_number}</Text>
                  )}
                  {Boolean(item.email) && !item.phone_number && (
                    <Text style={styles.contactDetail}>{item.email}</Text>
                  )}
                </View>
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.colors.primary} />
              </TouchableOpacity>
            )}
          />
        ) : searchQuery.trim().length > 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="person-circle-outline" size={60} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>No users found</Text>
            <Text style={styles.emptySub}>
              We couldn't find any registered users matching "{searchQuery}".
            </Text>
          </View>
        ) : (
          <View style={styles.centerContainer}>
            <Ionicons name="search-outline" size={56} color={theme.colors.surfaceLight} />
            <Text style={styles.emptyTitle}>Find Anyone to Chat</Text>
            <Text style={styles.emptySub}>
              Enter a phone number, email address, or username to initiate a message request.
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
  },
  clearBtn: {
    padding: 4,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceLight,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  displayName: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  handle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  contactDetail: {
    fontSize: 12,
    color: theme.colors.primary,
    marginTop: 2,
  },
  statusBadgeAccepted: {
    marginLeft: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeTextAccepted: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
  },
  statusBadgePending: {
    marginLeft: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeTextPending: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F59E0B',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginTop: 16,
  },
  emptySub: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
