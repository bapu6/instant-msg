import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';
import { StoryItem } from '../types';

const MOCK_STORIES: StoryItem[] = [
  { id: '1', name: 'David K.', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', hasUnseen: true },
  { id: '2', name: 'Elena R.', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80', hasUnseen: true },
  { id: '3', name: 'Marcus L.', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', hasUnseen: false },
  { id: '4', name: 'Design Team', avatar: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80', hasUnseen: true },
  { id: '5', name: 'Chloe M.', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80', hasUnseen: false },
];

interface StoriesBarProps {
  onStoryPress: (story: StoryItem) => void;
  onAddStory: () => void;
}

export default function StoriesBar({ onStoryPress, onAddStory }: StoriesBarProps) {
  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Your Story item */}
        <TouchableOpacity style={styles.storyItem} onPress={onAddStory} activeOpacity={0.8}>
          <View style={styles.myStoryContainer}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' }}
              style={styles.storyAvatar}
            />
            <View style={styles.addIconCircle}>
              <Ionicons name="add" size={14} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.storyName} numberOfLines={1}>Your Story</Text>
        </TouchableOpacity>

        {/* Other users' stories */}
        {MOCK_STORIES.map((story) => (
          <TouchableOpacity 
            key={story.id} 
            style={styles.storyItem} 
            onPress={() => onStoryPress(story)}
            activeOpacity={0.8}
          >
            <View style={[
              styles.storyRing, 
              story.hasUnseen ? styles.activeRing : styles.seenRing
            ]}>
              <Image source={{ uri: story.avatar }} style={styles.storyAvatar} />
            </View>
            <Text style={styles.storyName} numberOfLines={1}>{story.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: theme.spacing.md,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    flexDirection: 'row',
    gap: 16,
  },
  storyItem: {
    alignItems: 'center',
    width: 68,
  },
  myStoryContainer: {
    position: 'relative',
    padding: 2,
  },
  storyRing: {
    padding: 2,
    borderRadius: 34,
    borderWidth: 2,
  },
  activeRing: {
    borderColor: theme.colors.primary,
  },
  seenRing: {
    borderColor: theme.colors.cardBorder,
  },
  storyAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  addIconCircle: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  storyName: {
    marginTop: 6,
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
});
