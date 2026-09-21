import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { theme } from '../theme/theme';

export interface NotificationBannerData {
  id: string | number;
  senderUsername: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  isMedia?: boolean;
}

interface InAppNotificationBannerProps {
  data: NotificationBannerData | null;
  onPress: (senderUsername: string) => void;
  onDismiss: () => void;
}

export default function InAppNotificationBanner({
  data,
  onPress,
  onDismiss,
}: InAppNotificationBannerProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    if (data) {
      // Slide down
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }).start();

      // Auto dismiss after 4.5s
      const timer = setTimeout(() => {
        handleDismiss();
      }, 4500);

      return () => clearTimeout(timer);
    } else {
      slideAnim.setValue(-120);
    }
  }, [data]);

  const handleDismiss = () => {
    Animated.timing(slideAnim, {
      toValue: -120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
  };

  if (!data) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 24 : 12) + 6,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.banner}
        activeOpacity={0.9}
        onPress={() => {
          handleDismiss();
          onPress(data.senderUsername);
        }}
      >
        <Avatar uri={data.senderAvatar} name={data.senderName} size={40} style={styles.avatar} />

        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={styles.senderName} numberOfLines={1}>
              {data.senderName}
            </Text>
            <View style={styles.e2eeBadge}>
              <Ionicons name="lock-closed" size={10} color="#25D366" style={{ marginRight: 3 }} />
              <Text style={styles.e2eeText}>E2EE</Text>
            </View>
          </View>

          <Text style={styles.messageText} numberOfLines={2}>
            {data.text}
          </Text>
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={18} color="#94A3B8" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999999,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  banner: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#334155',
  },
  content: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  senderName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginRight: 6,
  },
  e2eeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(37, 211, 102, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  e2eeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#25D366',
  },
  messageText: {
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 18,
  },
  closeBtn: {
    padding: 4,
  },
});
