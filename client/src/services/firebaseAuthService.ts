import { Platform } from 'react-native';
import api from '../config/api';
import { User } from '../types';

// Holds the confirmation result from Firebase Phone Auth (native only)
let confirmationResult: any = null;

/**
 * Helper to convert phone number to E.164 format (e.g. +917008545948)
 */
export function toE164Phone(phone: string, defaultCountryCode: string = '+91'): string {
  let cleaned = phone.trim().replace(/[\s\(\)\-]/g, '');
  if (!cleaned.startsWith('+')) {
    cleaned = `${defaultCountryCode}${cleaned.replace(/^0+/, '')}`;
  }
  return cleaned;
}

/**
 * Send real SMS verification code via Firebase Phone Auth on Android (v26 modular API).
 * Uses SafetyNet/Play Integrity for silent verification (no browser reCAPTCHA).
 * Falls back to backend OTP if Firebase fails.
 */
export async function sendFirebasePhoneOtp(
  phoneNumber: string
): Promise<{ success: boolean; isNativeFirebase: boolean }> {
  const cleanPhone = toE164Phone(phoneNumber);

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
  const cleanPhone = toE164Phone(phoneNumber);
  const cleanCode = code.trim();

  if (Platform.OS === 'android' && confirmationResult) {
    try {
      console.log('🔥 [Firebase Native] Confirming code with Firebase...');
      const userCredential = await confirmationResult.confirm(cleanCode);
      console.log('✅ [Firebase Native] Firebase confirmed user:', userCredential?.user?.uid);

      let idToken = '';
      try {
        idToken = await userCredential.user?.getIdToken();
      } catch (tokenErr) {
        console.warn('Could not fetch idToken, falling back to flag:', tokenErr);
      }

      // Firebase auth succeeded — register/login the user in our backend
      const user = await api.phoneLogin(cleanPhone, displayName, undefined, undefined, idToken || 'firebase-verified');
      confirmationResult = null;
      return user;
    } catch (err: any) {
      console.warn('⚠️ [Firebase Native] Confirmation failed:', err.message);
      // If Firebase Native code confirmation failed, don't fallback silently to backend OTP unless user tried backend OTP
      throw new Error(err.message || 'Invalid SMS verification code');
    }
  }

  // Fallback: backend OTP verify (passing displayName so it gets saved)
  return await api.verifyOtp(cleanPhone, cleanCode, displayName);
}

export default {
  sendFirebasePhoneOtp,
  verifyFirebasePhoneOtp,
};
