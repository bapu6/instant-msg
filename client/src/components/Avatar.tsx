import React from 'react';
import { View, Text, Image, StyleSheet, StyleProp, ViewStyle, ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AvatarProps {
  uri?: string | null;
  name?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
  isGroup?: boolean;
}

const AVATAR_COLORS = [
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#F43F5E',
  '#10B981',
  '#06B6D4',
  '#3B82F6',
  '#F59E0B',
];

function getBackgroundColor(name?: string | null): string {
  if (!name) return '#64748B';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

export default function Avatar({ uri, name, size = 40, style, isGroup = false }: AvatarProps) {
  const hasValidUri = Boolean(uri && uri.trim() && !uri.includes('unsplash.com'));

  if (hasValidUri) {
    return (
      <Image
        source={{ uri: uri! }}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style as ImageStyle]}
      />
    );
  }

  const initial = name && name.trim() ? name.trim().charAt(0).toUpperCase() : '';
  const bgColor = getBackgroundColor(name);

  return (
    <View
      style={[
        styles.placeholder,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: isGroup ? '#475569' : bgColor,
        },
        style,
      ]}
    >
      {initial ? (
        <Text style={[styles.initialText, { fontSize: Math.max(12, Math.floor(size * 0.45)) }]}>{initial}</Text>
      ) : (
        <Ionicons name={isGroup ? 'people' : 'person'} size={Math.floor(size * 0.55)} color="#FFFFFF" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  initialText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
