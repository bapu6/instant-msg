import React from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';
import { FilterType } from '../types';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (text: string) => void;
  activeFilter: FilterType;
  onSelectFilter: (filter: FilterType) => void;
}

export default function SearchBar({
  searchQuery,
  onSearchChange,
  activeFilter,
  onSelectFilter,
}: SearchBarProps) {
  const filters: FilterType[] = ['All', 'Unread', 'Groups', 'Direct'];

  return (
    <View style={styles.wrapper}>
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color={theme.colors.textMuted} style={styles.searchIcon} />
        <TextInput
          placeholder="Search chats, groups, messages..."
          placeholderTextColor={theme.colors.textMuted}
          value={searchQuery}
          onChangeText={onSearchChange}
          style={styles.input}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => onSearchChange('')} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterList}
      >
        {filters.map((filter) => {
          const isActive = activeFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
              style={[styles.filterChip, isActive && styles.activeFilterChip]}
              onPress={() => onSelectFilter(filter)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterText, isActive && styles.activeFilterText]}>
                {filter}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    paddingHorizontal: theme.spacing.md,
    height: 48,
    ...theme.shadows.card,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    height: '100%',
  },
  clearBtn: {
    padding: 4,
  },
  filterList: {
    flexDirection: 'row',
    gap: 10,
    marginTop: theme.spacing.md,
    paddingBottom: 2,
  },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  activeFilterChip: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  activeFilterText: {
    color: '#FFFFFF',
  },
});
