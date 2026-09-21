import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import api from '../config/api';

interface UserProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function UserProfileModal({ visible, onClose }: UserProfileModalProps) {
  const { currentUser, setCurrentUser, logout } = useAuth();

  const [displayName, setDisplayName] = useState(currentUser?.display_name || '');
  const [phoneNumber, setPhoneNumber] = useState(currentUser?.phone_number || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync state whenever modal opens or currentUser changes
  React.useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.display_name || '');
      setPhoneNumber(currentUser.phone_number || '');
      setEmail(currentUser.email || '');
    }
  }, [currentUser, visible]);

  if (!currentUser) return null;

  const handleSaveProfile = async () => {
    if (!currentUser.id) return;
    setSaving(true);
    try {
      const updated = await api.linkProfile({
        userId: currentUser.id,
        displayName: displayName.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        email: email.trim() || undefined,
      });
      setCurrentUser(updated);
      setIsEditing(false);
      Alert.alert('Profile Updated', 'Your profile and linked accounts have been synchronized.');
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Could not update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLinkGoogle = async () => {
    try {
      const { signInWithGoogle } = require('../services/googleAuthService');
      const googleUser = await signInWithGoogle();
      setCurrentUser(googleUser);
      Alert.alert('Google Linked', `Linked with ${googleUser.email || 'Google account'}`);
    } catch (err: any) {
      Alert.alert('Google Link Error', err.message || 'Could not link Google account');
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          onClose();
          logout();
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Account Profile</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
            {/* Avatar & Main Name */}
            <View style={styles.avatarSection}>
              <View style={styles.avatarWrapper}>
                <Image
                  source={{
                    uri:
                      currentUser.avatar ||
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
                  }}
                  style={styles.avatar}
                />
              </View>
              <Text style={styles.nameText}>
                {currentUser.display_name || currentUser.username}
              </Text>
              <Text style={styles.usernameText}>@{currentUser.username}</Text>
            </View>

            {/* Unified Account Badge */}
            <View style={styles.unifiedBadgeContainer}>
              <Ionicons name="shield-checkmark" size={18} color="#10B981" />
              <Text style={styles.unifiedBadgeText}>
                {currentUser.email && currentUser.phone_number
                  ? 'Unified Profile (Google + Phone Linked)'
                  : currentUser.email
                  ? 'Connected via Google Account'
                  : 'Connected via Phone OTP'}
              </Text>
            </View>

            {/* Profile Info Cards */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>Identity & Contact Info</Text>
                {!isEditing && (
                  <TouchableOpacity onPress={() => setIsEditing(true)}>
                    <Text style={styles.editText}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Display Name */}
              <View style={styles.infoRow}>
                <View style={styles.iconCircle}>
                  <Ionicons name="person-outline" size={18} color={theme.colors.primary} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.fieldLabel}>Display Name</Text>
                  {isEditing ? (
                    <TextInput
                      style={styles.input}
                      value={displayName}
                      onChangeText={setDisplayName}
                      placeholder="Your Full Name"
                      placeholderTextColor={theme.colors.textMuted}
                    />
                  ) : (
                    <Text style={styles.fieldValue}>{currentUser.display_name || 'Not set'}</Text>
                  )}
                </View>
              </View>

              {/* Email (Google) */}
              <View style={styles.infoRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="logo-google" size={18} color="#EA4335" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.fieldLabel}>Google / Email</Text>
                  {currentUser.email ? (
                    <View style={styles.verifiedRow}>
                      <Text style={styles.fieldValue}>{currentUser.email}</Text>
                      <View style={styles.verifiedBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                        <Text style={styles.verifiedText}>Linked</Text>
                      </View>
                    </View>
                  ) : isEditing ? (
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="user@example.com"
                      placeholderTextColor={theme.colors.textMuted}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  ) : (
                    <TouchableOpacity style={styles.linkButton} onPress={handleLinkGoogle}>
                      <Ionicons name="link-outline" size={15} color={theme.colors.primary} />
                      <Text style={styles.linkButtonText}>Connect Google Account</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Mobile Phone */}
              <View style={styles.infoRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="call-outline" size={18} color="#10B981" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.fieldLabel}>Mobile Number</Text>
                  {currentUser.phone_number ? (
                    <View style={styles.verifiedRow}>
                      <Text style={styles.fieldValue}>{currentUser.phone_number}</Text>
                      <View style={styles.verifiedBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                        <Text style={styles.verifiedText}>Verified</Text>
                      </View>
                    </View>
                  ) : isEditing ? (
                    <TextInput
                      style={styles.input}
                      value={phoneNumber}
                      onChangeText={setPhoneNumber}
                      placeholder="+91 98765 43210"
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="phone-pad"
                    />
                  ) : (
                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={() => setIsEditing(true)}
                    >
                      <Ionicons name="add-circle-outline" size={15} color={theme.colors.primary} />
                      <Text style={styles.linkButtonText}>Add Mobile Number</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {/* Save / Cancel buttons when editing */}
            {isEditing && (
              <View style={styles.editActions}>
                <TouchableOpacity
                  style={[styles.btn, styles.cancelBtn]}
                  onPress={() => setIsEditing(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.saveBtn]}
                  onPress={handleSaveProfile}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save & Combine</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Info note about profile merging */}
            <View style={styles.noteBox}>
              <Ionicons name="information-circle-outline" size={18} color={theme.colors.textSecondary} />
              <Text style={styles.noteText}>
                If you registered previously using either Mobile or Google, adding both links them into a single unified profile with all your messages preserved.
              </Text>
            </View>

            {/* Sign Out Button */}
            <TouchableOpacity style={styles.signOutBtn} activeOpacity={0.8} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '88%',
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
  scrollBody: {
    paddingBottom: 20,
  },
  avatarSection: {
    alignItems: 'center',
    marginVertical: 12,
  },
  avatarWrapper: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    borderColor: theme.colors.primary,
    overflow: 'hidden',
    marginBottom: 10,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  nameText: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  usernameText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  unifiedBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginVertical: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  unifiedBadgeText: {
    fontSize: 13,
    color: '#065F46',
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 16,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  infoContent: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
  },
  verifiedText: {
    fontSize: 11,
    color: '#065F46',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: theme.colors.textPrimary,
    marginTop: 4,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  linkButtonText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#E2E8F0',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  noteBox: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginVertical: 12,
    gap: 8,
    alignItems: 'flex-start',
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    marginTop: 10,
    gap: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
  },
});
