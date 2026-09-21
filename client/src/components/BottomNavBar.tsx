import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';

interface TabItem {
  id: string;
  label: string;
  icon: any;
  badge: number;
}

interface BottomNavBarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export default function BottomNavBar({ activeTab, onTabChange }: BottomNavBarProps) {
  const tabs: TabItem[] = [
    { id: 'chats', label: 'Chats', icon: 'chatbubbles', badge: 3 },
    { id: 'calls', label: 'Calls', icon: 'call', badge: 0 },
    { id: 'contacts', label: 'Contacts', icon: 'people', badge: 0 },
    { id: 'settings', label: 'Settings', icon: 'settings', badge: 0 },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.navBar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tabItem}
              onPress={() => onTabChange(tab.id)}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                <Ionicons
                  name={isActive ? tab.icon : `${tab.icon}-outline`}
                  size={24}
                  color={isActive ? theme.colors.primary : theme.colors.textMuted}
                />
                {tab.badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{tab.badge}</Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  isActive ? styles.activeTabLabel : styles.inactiveTabLabel,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.cardBorder,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    paddingTop: 8,
    ...theme.shadows.card,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  iconContainer: {
    position: 'relative',
    padding: 2,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -8,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  activeTabLabel: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  inactiveTabLabel: {
    color: theme.colors.textMuted,
    fontWeight: '500',
  },
});
