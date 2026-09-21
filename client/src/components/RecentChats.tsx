import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';
import { ChatContact } from '../types';

import Avatar from './Avatar';

interface RecentChatsProps {
  chats: ChatContact[];
  onChatPress: (chat: ChatContact) => void;
}

export default function RecentChats({ chats, onChatPress }: RecentChatsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Messages</Text>
      </View>

      <View style={styles.chatList}>
        {chats.map((chat) => (
          <TouchableOpacity
            key={chat.id}
            style={styles.chatItem}
            activeOpacity={0.7}
            onPress={() => onChatPress(chat)}
          >
            <View style={styles.avatarContainer}>
              <Avatar uri={chat.avatar} name={chat.name} size={48} isGroup={chat.isGroup} style={styles.avatar} />
              {chat.isOnline && !chat.hidePresence && <View style={styles.onlineBadge} />}
            </View>

            <View style={styles.chatContent}>
              <View style={styles.topRow}>
                <View style={styles.nameContainer}>
                  <Text style={styles.chatName} numberOfLines={1}>
                    {chat.name}
                  </Text>
                  {chat.isGroup && (
                    <View style={styles.groupBadge}>
                      <Text style={styles.groupBadgeText}>Group</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.timeText, chat.unreadCount > 0 && styles.timeActive]}>
                  {chat.time}
                </Text>
              </View>

              <View style={styles.bottomRow}>
                <Text
                  style={[
                    styles.lastMessage,
                    chat.unreadCount > 0 ? styles.lastMessageUnread : styles.lastMessageRead,
                  ]}
                  numberOfLines={1}
                >
                  {chat.isTyping ? (
                    <Text style={styles.typingText}>typing...</Text>
                  ) : (
                    chat.lastMessage
                  )}
                </Text>

                {chat.unreadCount > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                    </Text>
                  </View>
                ) : chat.isRead ? (
                  <Ionicons
                    name="checkmark-done"
                    size={16}
                    color="#38BDF8"
                  />
                ) : chat.isDelivered ? (
                  <Ionicons
                    name="checkmark-done"
                    size={16}
                    color={theme.colors.textMuted}
                  />
                ) : chat.lastMessage && !chat.isGroup ? (
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color={theme.colors.textMuted}
                  />
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {chats.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.surfaceLight} />
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap the compose button below or search to start a private conversation or message request.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    paddingBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  seeAllText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  chatList: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    ...theme.shadows.card,
    overflow: 'hidden',
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: theme.spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.cardBorder,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: theme.colors.badgeOnline,
    borderWidth: 2,
    borderColor: theme.colors.card,
  },
  chatContent: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  chatName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  groupBadge: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  groupBadgeText: {
    fontSize: 10,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  timeText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '400',
  },
  timeActive: {
    color: '#25D366',
    fontWeight: '700',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  lastMessageUnread: {
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  lastMessageRead: {
    fontWeight: '400',
    color: theme.colors.textSecondary,
  },
  typingText: {
    color: theme.colors.primary,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  unreadBadge: {
    backgroundColor: '#25D366',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
