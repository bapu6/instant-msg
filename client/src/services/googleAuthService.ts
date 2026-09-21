import { Platform } from 'react-native';
import api from '../config/api';
import { User } from '../types';

/**
 * Sign in with Google on Web or Mobile Native.
 * - Web: Firebase Web SDK popup (firebase/auth)
 * - Mobile: @react-native-google-signin + @react-native-firebase/auth v26 modular API
 */
export async function signInWithGoogle(): Promise<User> {
  if (Platform.OS === 'web') {
    // Web browser: Firebase Web SDK with GoogleAuthProvider popup
    const { initializeApp, getApps } = require('firebase/app');
    const { getAuth, signInWithPopup, GoogleAuthProvider } = require('firebase/auth');
    const { FIREBASE_CONFIG } = require('../config/firebase');

    const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();

    console.log('🌐 [Google Web] Launching Google sign-in popup...');
    const result = await signInWithPopup(auth, provider);
    const fbUser = result.user;

    const email = fbUser.email || '';
    const displayName = fbUser.displayName || email.split('@')[0] || 'Google User';
    const avatar = fbUser.photoURL || undefined;

    return await api.googleLogin(email, displayName, avatar);
  }

  // Mobile (Android/iOS): @react-native-google-signin + @react-native-firebase/auth v26 modular API
  const { GoogleSignin } = require('@react-native-google-signin/google-signin');

  // @react-native-firebase/auth v26 — fully modular, NO default export
  const rnfAuth = require('@react-native-firebase/auth');
  const { getAuth, signInWithCredential, GoogleAuthProvider } = rnfAuth;

  // Read webClientId (client_type: 3) from the bundled google-services.json
  let webClientId: string | undefined;
  try {
    const googleServices = require('../../google-services.json');
    const oauthClients: any[] = googleServices?.client?.[0]?.oauth_client || [];
    const webClient = oauthClients.find((c: any) => c.client_type === 3);
    if (webClient?.client_id) {
      webClientId = webClient.client_id;
    }
  } catch (e) {
    console.warn('Could not read webClientId from google-services.json', e);
  }

  if (!webClientId) {
    throw new Error(
      'Google Web Client ID missing. Download the updated google-services.json from Firebase Console.'
    );
  }

  GoogleSignin.configure({
    webClientId,
    offlineAccess: true,
  });

  // Check Google Play Services availability
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  // Trigger native Google account picker
  const signInResult = await GoogleSignin.signIn();
  const idToken = signInResult.data?.idToken ?? (signInResult as any).idToken;

  if (!idToken) {
    throw new Error('Google Sign-In did not return an ID token.');
  }

  // Build the Firebase credential using the modular API
  const googleCredential = GoogleAuthProvider.credential(idToken);
  const auth = getAuth();
  const userCredential = await signInWithCredential(auth, googleCredential);
  const fbUser = userCredential.user;

  const email = fbUser.email || '';
  const displayName = fbUser.displayName || email.split('@')[0] || 'Google User';
  const avatar = fbUser.photoURL || undefined;

  return await api.googleLogin(email, displayName, avatar);
}

export default {
  signInWithGoogle,
};
