import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';
import { useAuth } from '../context/AuthContext';

export default function AuthScreen() {
  const { login, register, googleSignIn /*, sendOtp, verifyOtp */ } = useAuth();

  // Mode: 'login' (Sign In) or 'register' (Sign Up)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Form Fields
  const [emailOrUsername, setEmailOrUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [infoMsg, setInfoMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState<boolean>(false);

  /*
  // ================= OTP VERIFICATION BLOCK (COMMENTED OUT FOR NOW) =================
  // const [otpMode, setOtpMode] = useState<'phone' | 'otp'>('phone');
  // const [phoneNumber, setPhoneNumber] = useState<string>('');
  // const [otpCode, setOtpCode] = useState<string>('');

  // const handleSendOtp = async () => {
  //   setErrorMsg('');
  //   setIsSubmitting(true);
  //   try {
  //     await sendOtp(phoneNumber);
  //     setOtpMode('otp');
  //   } catch (err: any) {
  //     setErrorMsg(err.message || 'Failed to send OTP');
  //   } finally {
  //     setIsSubmitting(false);
  //   }
  // };

  // const handleVerifyOtp = async () => {
  //   setErrorMsg('');
  //   setIsSubmitting(true);
  //   try {
  //     await verifyOtp(phoneNumber, otpCode, displayName);
  //   } catch (err: any) {
  //     setErrorMsg(err.message || 'OTP verification failed');
  //   } finally {
  //     setIsSubmitting(false);
  //   }
  // };
  // =================================================================================
  */

  // Email / Password Login or Register
  const handleEmailAuth = async () => {
    setErrorMsg('');
    setInfoMsg('');

    if (!emailOrUsername.trim()) {
      setErrorMsg('Please enter your email or username');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('Please enter your password');
      return;
    }

    setIsSubmitting(true);
    try {
      if (authMode === 'login') {
        await login(emailOrUsername.trim(), password.trim());
      } else {
        await register(
          emailOrUsername.trim(),
          password.trim(),
          displayName.trim() || undefined
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || `${authMode === 'login' ? 'Login' : 'Registration'} failed.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Google Sign-In
  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setIsGoogleSubmitting(true);
    try {
      await googleSignIn();
    } catch (err: any) {
      console.error('Google sign in error:', err);
      setErrorMsg(err.message || 'Google sign-in was cancelled or failed.');
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Ionicons name="chatbubbles" size={36} color="#FFF" />
          </View>
          <Text style={styles.appName}>Instant Msg</Text>
          <Text style={styles.appTagline}>
            Sign in with your email or account to get started
          </Text>
        </View>

        {/* Error and Info Banners */}
        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color="#EF4444" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        {infoMsg ? (
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={18} color={theme.colors.primary} />
            <Text style={styles.infoText}>{infoMsg}</Text>
          </View>
        ) : null}

        {/* Card Container */}
        <View style={styles.card}>
          {/* Auth Mode Toggle Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, authMode === 'login' && styles.activeTab]}
              onPress={() => {
                setAuthMode('login');
                setErrorMsg('');
              }}
            >
              <Text style={[styles.tabText, authMode === 'login' && styles.activeTabText]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, authMode === 'register' && styles.activeTab]}
              onPress={() => {
                setAuthMode('register');
                setErrorMsg('');
              }}
            >
              <Text style={[styles.tabText, authMode === 'register' && styles.activeTabText]}>
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Display Name (Register Mode Only) */}
          {authMode === 'register' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Display Name</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color={theme.colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Alex Rivera"
                  placeholderTextColor={theme.colors.textTertiary}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          {/* Email / Username Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email or Username</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={theme.colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="user@example.com"
                placeholderTextColor={theme.colors.textTertiary}
                value={emailOrUsername}
                onChangeText={setEmailOrUsername}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={theme.colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                onSubmitEditing={handleEmailAuth}
              />
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.disabledButton]}
            onPress={handleEmailAuth}
            disabled={isSubmitting || isGoogleSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitButtonText}>
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          {/* OR Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Sign-In Button */}
          <TouchableOpacity
            style={[styles.googleButton, isGoogleSubmitting && styles.disabledButton]}
            onPress={handleGoogleSignIn}
            disabled={isSubmitting || isGoogleSubmitting}
          >
            {isGoogleSubmitting ? (
              <ActivityIndicator color={theme.colors.textPrimary} />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color="#EA4335" style={{ marginRight: 10 }} />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer info */}
        <View style={styles.footerContainer}>
          <Text style={styles.footerText}>Secured with End-to-End Encryption</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background || '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: theme.colors.primary || '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: theme.colors.primary || '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.textPrimary || '#1E293B',
    letterSpacing: -0.5,
  },
  appTagline: {
    fontSize: 14,
    color: theme.colors.textSecondary || '#64748B',
    marginTop: 6,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoText: {
    color: '#1D4ED8',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  card: {
    backgroundColor: theme.colors.card || '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 24,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface || '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: theme.colors.card || '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary || '#64748B',
  },
  activeTabText: {
    color: theme.colors.primary || '#6366F1',
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textPrimary || '#1E293B',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface || '#F8FAFC',
    borderWidth: 1,
    borderColor: theme.colors.border || '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: theme.colors.textPrimary || '#1E293B',
  },
  submitButton: {
    backgroundColor: theme.colors.primary || '#6366F1',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: theme.colors.primary || '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border || '#E2E8F0',
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textTertiary || '#94A3B8',
    marginHorizontal: 12,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border || '#E2E8F0',
    borderRadius: 12,
    height: 48,
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary || '#1E293B',
  },
  footerContainer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: theme.colors.textTertiary || '#94A3B8',
  },
});
