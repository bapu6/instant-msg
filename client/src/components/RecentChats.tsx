import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';
import { ChatContact } from '../types';

interface RecentChatsProps {
  chats: ChatContact[];
  onChatPress: (chat: ChatContact) => void;
}

export default function RecentChats({ chats, onChatPress }: RecentChatsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Messages</Text>
        <TouchableOpacity activeOpacity={0.7}>
          <Text style={styles.seeAllText}>See all ({chats.length})</Text>
        </TouchableOpacity>
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
              <Image source={{ uri: chat.avatar }} style={styles.avatar} />
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
                    <Text style={styles.unreadBadgeText}>{chat.unreadCount}</Text>
                  </View>
                ) : chat.isDelivered ? (
                  <Ionicons
                    name="checkmark-done"
                    size={16}
                    color={chat.isRead ? theme.colors.primary : theme.colors.textMuted}
                  />
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        ))}
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
    color: theme.colors.primary,
    fontWeight: '600',
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
    fontWeight: '600',
    color: theme.colors.text,
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
    backgroundColor: theme.colors.primary,
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
    fontWeight: '700',
  },
});
