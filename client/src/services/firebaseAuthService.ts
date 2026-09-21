import { Platform } from 'react-native';
import api from '../config/api';
import { User } from '../types';

// Holds the confirmation result from Firebase Phone Auth (native only)
let confirmationResult: any = null;

/**
 * Send real SMS verification code via Firebase Phone Auth on Mobile (v26 modular API),
 * or fallback to backend API on Web.
 */
export async function sendFirebasePhoneOtp(
  phoneNumber: string
): Promise<{ success: boolean; debugCode?: string; isNativeFirebase: boolean }> {
  const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');

  if (Platform.OS !== 'web') {
    // @react-native-firebase/auth v26 uses a fully modular API (no default export)
    const rnfAuth = require('@react-native-firebase/auth');
    const { getAuth, signInWithPhoneNumber } = rnfAuth;

    console.log('🔥 [Firebase Native] Requesting SMS OTP for:', cleanPhone);
    const auth = getAuth();
    confirmationResult = await signInWithPhoneNumber(auth, cleanPhone);
    console.log('✅ [Firebase Native] SMS sent via Firebase');
    return { success: true, isNativeFirebase: true };
  }

  // Web: use backend OTP (debug code shown in dev for testing only)
  const res = await api.sendOtp(cleanPhone);
  return { ...res, isNativeFirebase: false };
}

/**
 * Verify SMS code via Firebase on Mobile (v26 modular API) or Backend on Web,
 * then complete login/registration with the backend.
 */
export async function verifyFirebasePhoneOtp(
  phoneNumber: string,
  code: string,
  displayName?: string
): Promise<User> {
  const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
  const cleanCode = code.trim();

  if (Platform.OS !== 'web' && confirmationResult) {
    try {
      console.log('🔥 [Firebase Native] Confirming code with Firebase...');
      const userCredential = await confirmationResult.confirm(cleanCode);
      console.log('✅ [Firebase Native] Firebase confirmed user:', userCredential?.user?.uid);

      // Firebase auth succeeded — register/login the user in our backend
      const user = await api.phoneLogin(cleanPhone, displayName);
      confirmationResult = null;
      return user;
    } catch (err: any) {
      console.warn('⚠️ [Firebase Native] Confirmation failed:', err.message);
      // If Firebase verification failed, try backend verify as last resort
      return await api.verifyOtp(cleanPhone, cleanCode, displayName);
    }
  }

  // Web: verify via backend
  return await api.verifyOtp(cleanPhone, cleanCode, displayName);
}

export default {
  sendFirebasePhoneOtp,
  verifyFirebasePhoneOtp,
};
