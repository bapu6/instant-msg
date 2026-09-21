import { Platform } from 'react-native';
import api from '../config/api';
import { User } from '../types';

// Holds the confirmation result from Firebase Phone Auth (native only)
let confirmationResult: any = null;

/**
 * Send SMS verification code directly via in-app OTP service.
 * Bypasses external browser reCAPTCHA redirects for a seamless in-app experience.
 */
export async function sendFirebasePhoneOtp(
  phoneNumber: string
): Promise<{ success: boolean; isNativeFirebase: boolean }> {
  const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');

  console.log('📱 [In-App OTP] Requesting verification code for:', cleanPhone);
  const res = await api.sendOtp(cleanPhone);
  console.log('✅ [In-App OTP] Verification code generated/sent successfully');
  return { ...res, isNativeFirebase: false };
}

/**
 * Verify SMS code directly in-app, then complete login/registration.
 */
export async function verifyFirebasePhoneOtp(
  phoneNumber: string,
  code: string,
  displayName?: string
): Promise<User> {
  const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
  const cleanCode = code.trim();

  console.log('📱 [In-App OTP] Verifying code for:', cleanPhone);
  return await api.verifyOtp(cleanPhone, cleanCode, displayName);
}

export default {
  sendFirebasePhoneOtp,
  verifyFirebasePhoneOtp,
};
