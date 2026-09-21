import { Platform } from 'react-native';
import api from '../config/api';
import { User } from '../types';

// Holds the confirmation result from Firebase Phone Auth (native only)
let confirmationResult: any = null;

/**
 * Send real SMS verification code via Firebase Phone Auth on Android (v26 modular API).
 * Uses SafetyNet/Play Integrity for silent verification (no browser reCAPTCHA).
 * Falls back to backend OTP if Firebase fails.
 */
export async function sendFirebasePhoneOtp(
  phoneNumber: string
): Promise<{ success: boolean; isNativeFirebase: boolean }> {
  const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');

  if (Platform.OS === 'android') {
    try {
      const rnfAuth = require('@react-native-firebase/auth');
      const { getAuth, signInWithPhoneNumber } = rnfAuth;

      const auth = getAuth();

      // Disable browser reCAPTCHA fallback — use Play Integrity / SafetyNet silently.
      // This prevents Firebase from redirecting the user to an external browser.
      // Requires the release SHA-256 fingerprint to be registered in Firebase Console.
      if (auth.settings && typeof auth.settings.forceRecaptchaFlow !== 'undefined') {
        auth.settings.forceRecaptchaFlow = false;
      }

      console.log('🔥 [Firebase Native] Requesting SMS OTP for:', cleanPhone);
      confirmationResult = await signInWithPhoneNumber(auth, cleanPhone);
      console.log('✅ [Firebase Native] SMS sent via Firebase');
      return { success: true, isNativeFirebase: true };
    } catch (err: any) {
      console.warn('⚠️ [Firebase] signInWithPhoneNumber failed, falling back to backend OTP:', err.message);
      confirmationResult = null;
    }
  }

  // Backend fallback (web or if Firebase unavailable)
  const res = await api.sendOtp(cleanPhone);
  return { ...res, isNativeFirebase: false };
}

/**
 * Verify SMS code via Firebase on Android or Backend,
 * then complete login/registration with the backend (including displayName).
 */
export async function verifyFirebasePhoneOtp(
  phoneNumber: string,
  code: string,
  displayName?: string
): Promise<User> {
  const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
  const cleanCode = code.trim();

  if (Platform.OS === 'android' && confirmationResult) {
    try {
      console.log('🔥 [Firebase Native] Confirming code with Firebase...');
      const userCredential = await confirmationResult.confirm(cleanCode);
      console.log('✅ [Firebase Native] Firebase confirmed user:', userCredential?.user?.uid);

      // Firebase auth succeeded — register/login the user in our backend WITH displayName & code verification
      const user = await api.phoneLogin(cleanPhone, displayName, undefined, cleanCode);
      confirmationResult = null;
      return user;
    } catch (err: any) {
      console.warn('⚠️ [Firebase Native] Confirmation failed:', err.message);
      // Backend OTP verify as fallback (still passes displayName)
      return await api.verifyOtp(cleanPhone, cleanCode, displayName);
    }
  }

  // Fallback: backend OTP verify (passing displayName so it gets saved)
  return await api.verifyOtp(cleanPhone, cleanCode, displayName);
}

export default {
  sendFirebasePhoneOtp,
  verifyFirebasePhoneOtp,
};
