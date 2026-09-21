import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';
import { QuickActionItem } from '../types';

interface QuickActionsProps {
  onActionPress: (actionId: string) => void;
}

export default function QuickActions({ onActionPress }: QuickActionsProps) {
  const actions: QuickActionItem[] = [
    {
      id: 'new_chat',
      label: 'New Chat',
      icon: 'chatbubble-ellipses-outline',
      bgColor: '#EEF2FF',
      iconColor: '#4F46E5',
    },
    {
      id: 'new_group',
      label: 'New Group',
      icon: 'people-outline',
      bgColor: '#F3E8FF',
      iconColor: '#8B5CF6',
    },
    {
      id: 'calls',
      label: 'Voice/Video',
      icon: 'videocam-outline',
      bgColor: '#E0F2FE',
      iconColor: '#0EA5E9',
    },
    {
      id: 'saved',
      label: 'Saved Notes',
      icon: 'bookmark-outline',
      bgColor: '#FEF3C7',
      iconColor: '#D97706',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.actionRow}>
        {actions.map((act) => (
          <TouchableOpacity
            key={act.id}
            style={styles.actionBtn}
            onPress={() => onActionPress(act.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: act.bgColor }]}>
              <Ionicons name={act.icon} size={22} color={act.iconColor} />
            </View>
            <Text style={styles.actionLabel}>{act.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    ...theme.shadows.card,
  },
  actionBtn: {
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
});
