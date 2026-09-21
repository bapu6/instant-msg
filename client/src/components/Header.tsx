import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';

interface HeaderProps {
  onNotificationPress: () => void;
  onProfilePress: () => void;
}

export default function Header({ onNotificationPress, onProfilePress }: HeaderProps) {
  const { currentUser, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      `Sign out from @${currentUser?.username || ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.profileSection} 
        activeOpacity={0.8}
        onPress={onProfilePress}
      >
        <View style={styles.avatarWrapper}>
          <Avatar
            uri={currentUser?.avatar}
            name={currentUser?.display_name || currentUser?.username}
            size={40}
            style={styles.avatar}
          />
          <View style={styles.onlineBadge} />
        </View>
        <View style={styles.welcomeTextGroup}>
          <Text style={styles.greeting} numberOfLines={1}>
            {currentUser?.email || currentUser?.phone_number || 'Connected as'}
          </Text>
          <Text style={styles.userName} numberOfLines={1}>{currentUser?.display_name || currentUser?.username || 'User'}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.actionSection}>
        <TouchableOpacity 
          style={styles.iconButton} 
          activeOpacity={0.7}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={22} color={theme.colors.error || '#EF4444'} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.iconButton} 
          activeOpacity={0.7}
          onPress={onNotificationPress}
        >
          <Ionicons name="notifications-outline" size={22} color={theme.colors.textPrimary || '#1E293B'} />
          <View style={styles.notificationDot} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: theme.colors.cardBorder,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.badgeOnline,
    borderWidth: 2,
    borderColor: theme.colors.card,
  },
  welcomeTextGroup: {
    marginLeft: theme.spacing.md,
  },
  greeting: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  actionSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    ...theme.shadows.card,
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.danger,
    borderWidth: 1.5,
    borderColor: theme.colors.card,
  },
});
