import React, { useState, useEffect } from 'react';
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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme/theme';
import { useAuth } from '../context/AuthContext';

export default function AuthScreen() {
  const { sendOtp, verifyOtp, googleSignIn } = useAuth();

  // Mode: 'phone' (step 1: enter number), 'otp' (step 2: enter code)
  const [authMode, setAuthMode] = useState<'phone' | 'otp'>('phone');
  const [countryCode] = useState<string>('+91');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [infoMsg, setInfoMsg] = useState<string>('');
  const [resendCountdown, setResendCountdown] = useState<number>(30);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState<boolean>(false);

  // Resend OTP countdown timer
  useEffect(() => {
    let timer: any = null;
    if (authMode === 'otp' && resendCountdown > 0) {
      timer = setInterval(() => {
        setResendCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [authMode, resendCountdown]);

  const getFullPhone = (): string => {
    let raw = phoneNumber.replace(/[^0-9]/g, '');
    if (raw.startsWith('0')) {
      raw = raw.slice(1);
    }
    if (raw.length === 12 && raw.startsWith('91')) {
      return `+${raw}`;
    }
    return `${countryCode}${raw}`;
  };

  // 1. Send OTP
  const handleSendOtp = async (e?: any) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    setErrorMsg('');
    setInfoMsg('');
    const raw = phoneNumber.replace(/[^0-9]/g, '');
    if (raw.length < 8) {
      setErrorMsg('Please enter a valid mobile number');
      return;
    }

    setIsSubmitting(true);
    try {
      const full = getFullPhone();
      const res = await sendOtp(full);
      setAuthMode('otp');
      setResendCountdown(30);
      // On native mobile, Firebase sends a real SMS — never show or auto-fill the code.
      // On web only (dev), show the debug code so the flow can be tested without SMS.
      if (res?.debugCode && Platform.OS === 'web') {
        setInfoMsg(`[Dev] Verification code: ${res.debugCode}`);
        // Do NOT auto-fill otpCode so the user still has to type it manually
      } else if (Platform.OS !== 'web') {
        // Native: Firebase SMS was triggered (or fallback backend OTP sent via SMS in future)
        setInfoMsg('Verification code sent to your mobile number.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Verify OTP
  const handleVerifyOtp = async (e?: any) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    setErrorMsg('');
    if (!otpCode.trim() || otpCode.trim().length < 4) {
      setErrorMsg('Please enter the verification code');
      return;
    }

    setIsSubmitting(true);
    try {
      const full = getFullPhone();
      await verifyOtp(full, otpCode.trim(), displayName.trim() || undefined);
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification failed. Please check the code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Google Sign-In
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
            Enter your mobile number to sign in or get started
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

        {/* ================= STEP 1: PHONE INPUT ================= */}
        {authMode === 'phone' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Mobile Number</Text>
            <Text style={styles.cardSubtitle}>
              We will send you a 6-digit one-time password (OTP)
            </Text>

            <View style={styles.phoneInputRow}>
              <View style={styles.countryCodeBadge}>
                <Text style={styles.countryCodeText}>{countryCode}</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder="98765 43210"
                placeholderTextColor={theme.colors.textTertiary}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                autoFocus={Platform.OS === 'web'}
                onSubmitEditing={handleSendOtp}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.disabledButton]}
              onPress={handleSendOtp}
              disabled={isSubmitting || isGoogleSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>Send Verification Code</Text>
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
        )}

        {/* ================= STEP 2: OTP VERIFICATION ================= */}
        {authMode === 'otp' && (
          <View style={styles.card}>
            <View style={styles.phoneBadgeRow}>
              <Text style={styles.sentToText}>Code sent to {getFullPhone()}</Text>
              <TouchableOpacity
                onPress={() => {
                  setAuthMode('phone');
                  setOtpCode('');
                  setErrorMsg('');
                  setInfoMsg('');
                }}
              >
                <Text style={styles.editText}>Change</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>6-Digit OTP Code</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="key-outline" size={20} color={theme.colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { letterSpacing: 4, fontWeight: '700', fontSize: 18 }]}
                  placeholder="• • • • • •"
                  placeholderTextColor={theme.colors.textTertiary}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  onSubmitEditing={handleVerifyOtp}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Your Name (optional)</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color={theme.colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Alex Rivera"
                  placeholderTextColor={theme.colors.textTertiary}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  onSubmitEditing={handleVerifyOtp}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.disabledButton]}
              onPress={handleVerifyOtp}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>Verify & Continue</Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendContainer}>
              {resendCountdown > 0 ? (
                <Text style={styles.resendTimerText}>
                  Resend code in {resendCountdown}s
                </Text>
              ) : (
                <TouchableOpacity onPress={handleSendOtp} disabled={isSubmitting}>
                  <Text style={styles.resendLinkText}>Resend Code</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

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
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
  },
  appTagline: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 18,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  countryCodeBadge: {
    height: 50,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  phoneInput: {
    flex: 1,
    height: 50,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  phoneBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sentToText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  editText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  disabledButton: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textTertiary,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    height: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  googleButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  resendContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  resendTimerText: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  resendLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0E7FF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  infoText: {
    color: '#3730A3',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
    fontWeight: '600',
  },
  footerContainer: {
    marginTop: 28,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    fontWeight: '500',
  },
});
