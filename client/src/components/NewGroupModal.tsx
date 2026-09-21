import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';
import api from '../config/api';
import { User, ChatGroup } from '../types';

interface NewGroupModalProps {
  visible: boolean;
  onClose: () => void;
  currentUsername: string;
  onGroupCreated: (group: ChatGroup) => void;
}

const DEFAULT_GROUP_AVATARS = [
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=150&auto=format&fit=crop&q=80',
];

export default function NewGroupModal({
  visible,
  onClose,
  currentUsername,
  onGroupCreated,
}: NewGroupModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(DEFAULT_GROUP_AVATARS[0]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [fetchingUsers, setFetchingUsers] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setDescription('');
      setSelectedUsers(new Set());
      loadUsers();
    }
  }, [visible]);

  const loadUsers = async () => {
    try {
      setFetchingUsers(true);
      const users = await api.getUsers(currentUsername);
      setAvailableUsers(users);
    } catch (err) {
      console.error('Failed to load users for group:', err);
    } finally {
      setFetchingUsers(false);
    }
  };

  const toggleUser = (username: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Group Name Required', 'Please enter a name for your group.');
      return;
    }

    try {
      setLoading(true);
      const members = Array.from(selectedUsers);
      const newGroup = await api.createGroup({
        name: name.trim(),
        avatar: selectedAvatar,
        description: description.trim(),
        created_by: currentUsername,
        members,
      });

      onGroupCreated(newGroup);
      onClose();
    } catch (err: any) {
      console.error('Create group failed:', err);
      Alert.alert('Error', err.message || 'Could not create group.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Modal Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create New Group</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Group Details Form */}
          <View style={styles.formSection}>
            <Text style={styles.label}>Group Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Design Squad, Engineering Core"
              placeholderTextColor={theme.colors.textMuted}
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput
              style={[styles.input, { height: 40 }]}
              placeholder="What is this group about?"
              placeholderTextColor={theme.colors.textMuted}
              value={description}
              onChangeText={setDescription}
            />

            <Text style={styles.label}>Choose Group Icon</Text>
            <View style={styles.avatarPicker}>
              {DEFAULT_GROUP_AVATARS.map((uri, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => setSelectedAvatar(uri)}
                  style={[
                    styles.avatarOption,
                    selectedAvatar === uri && styles.avatarOptionSelected,
                  ]}
                >
                  <Image source={{ uri }} style={styles.avatarImg} />
                  {selectedAvatar === uri && (
                    <View style={styles.checkBadge}>
                      <Ionicons name="checkmark" size={12} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Select Members Section */}
          <View style={styles.membersSection}>
            <View style={styles.memberHeaderRow}>
              <Text style={styles.label}>Select Members ({selectedUsers.size})</Text>
              {availableUsers.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    if (selectedUsers.size === availableUsers.length) {
                      setSelectedUsers(new Set());
                    } else {
                      setSelectedUsers(new Set(availableUsers.map((u) => u.username)));
                    }
                  }}
                >
                  <Text style={styles.selectAllText}>
                    {selectedUsers.size === availableUsers.length ? 'Clear All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {fetchingUsers ? (
              <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 20 }} />
            ) : availableUsers.length === 0 ? (
              <Text style={styles.emptyText}>No other registered users found.</Text>
            ) : (
              <FlatList
                data={availableUsers}
                keyExtractor={(item) => item.username}
                style={styles.userList}
                renderItem={({ item }) => {
                  const isSelected = selectedUsers.has(item.username);
                  return (
                    <TouchableOpacity
                      style={[styles.userRow, isSelected && styles.userRowSelected]}
                      onPress={() => toggleUser(item.username)}
                      activeOpacity={0.7}
                    >
                      <Image
                        source={{
                          uri:
                            item.avatar ||
                            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
                        }}
                        style={styles.userAvatar}
                      />
                      <View style={styles.userInfo}>
                        <Text style={styles.userName}>{item.display_name || item.username}</Text>
                        <Text style={styles.userHandle}>@{item.username}</Text>
                      </View>
                      <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>

          {/* Create Button */}
          <TouchableOpacity
            style={[styles.createBtn, loading && styles.btnDisabled]}
            onPress={handleCreate}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.createBtnText}>Create Group</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  formSection: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.background,
  },
  avatarPicker: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  avatarOption: {
    position: 'relative',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 2,
  },
  avatarOptionSelected: {
    borderColor: theme.colors.primary,
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  checkBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: theme.colors.primary,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  membersSection: {
    flex: 1,
    minHeight: 180,
    maxHeight: 260,
  },
  memberHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectAllText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },
  userList: {
    marginTop: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  userRowSelected: {
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  userHandle: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  createBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
