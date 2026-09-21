import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import api from '../config/api';
import { User, AuthContextType } from '../types';
import { saveUserSession, getUserSession, clearUserSession } from '../services/sessionStorage';
import { sendFirebasePhoneOtp, verifyFirebasePhoneOtp } from '../services/firebaseAuthService';
import cryptoService from '../services/cryptoService';

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Ensures the authenticated user has an active X25519 keypair.
 * If keys already exist in the session, they are preserved.
 * If not, attempts to restore from server backup or generates a new pair.
 */
async function ensureUserKeys(user: User, secret?: string): Promise<User> {
  try {
    let priv = user.private_key;
    let pub = user.public_key;

    // 1. If both keys are present in session, ensure server knows public key
    if (priv && pub) {
      api.getUserPublicKey(user.username).then((remotePub) => {
        if (!remotePub) {
          api.updateUserKeys({ username: user.username, publicKey: pub! }).catch(() => {});
        }
      }).catch(() => {});
      return user;
    }

    const pass = secret || user.username + (user.phone_number || user.email || 'instant-msg-secret');

    // 2. Check if server has existing key backup
    const backup = await api.getUserKeyBackup(user.username);
    if (backup && backup.encryptedPrivateKey && backup.keySalt && backup.keyIv && backup.publicKey) {
      try {
        const restoredPriv = cryptoService.restorePrivateKey(
          backup.encryptedPrivateKey,
          pass,
          backup.keySalt,
          backup.keyIv
        );
        user.private_key = restoredPriv;
        user.public_key = backup.publicKey;
        return user;
      } catch (err) {
        console.warn('[AuthContext] Could not restore private key with provided secret, generating new pair', err);
      }
    }

    // 3. Generate a fresh key pair
    const keyPair = cryptoService.generateKeyPair();
    user.private_key = keyPair.privateKey;
    user.public_key = keyPair.publicKey;

    // Encrypt private key with user password/secret for safe cloud backup
    const encBackup = cryptoService.backupPrivateKey(keyPair.privateKey, pass);
    api.updateUserKeys({
      username: user.username,
      publicKey: keyPair.publicKey,
      encryptedPrivateKey: encBackup.encryptedPrivateKey,
      keySalt: encBackup.keySalt,
      keyIv: encBackup.keyIv,
    }).catch((err) => console.warn('[AuthContext] Failed to upload key backup:', err));

    return user;
  } catch (err) {
    console.error('[AuthContext] ensureUserKeys error:', err);
    return user;
  }
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Restore saved session on app startup
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const savedUser = await getUserSession();
        if (mounted && savedUser) {
          console.log('🔄 [AuthContext] Restoring user session:', savedUser.username);
          const userWithKeys = await ensureUserKeys(savedUser);
          if (mounted) {
            handleSetCurrentUser(userWithKeys);
          }
        }
      } catch (err) {
        console.warn('[AuthContext] Error restoring user session:', err);
      } finally {
        if (mounted) {
          setIsInitializing(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSetCurrentUser = (user: User | null) => {
    setCurrentUser(user);
    if (user) {
      saveUserSession(user);
    } else {
      clearUserSession();
    }
  };

  const login = async (username: string, password: string): Promise<User> => {
    setLoading(true);
    setError(null);
    try {
      const user = await api.login(username, password);
      const userWithKeys = await ensureUserKeys(user, password);
      handleSetCurrentUser(userWithKeys);
      return userWithKeys;
    } catch (err: any) {
      setError(err.message || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (
    username: string,
    password: string,
    displayName?: string,
    avatar?: string
  ): Promise<User> => {
    setLoading(true);
    setError(null);
    try {
      const user = await api.register(username, password, displayName, avatar);
      const userWithKeys = await ensureUserKeys(user, password);
      handleSetCurrentUser(userWithKeys);
      return userWithKeys;
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async (phoneNumber: string): Promise<{ success: boolean }> => {
    setError(null);
    try {
      return await sendFirebasePhoneOtp(phoneNumber);
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
      throw err;
    }
  };

  const verifyOtp = async (phoneNumber: string, code: string, displayName?: string): Promise<User> => {
    setLoading(true);
    setError(null);
    try {
      const user = await verifyFirebasePhoneOtp(phoneNumber, code, displayName);
      const userWithKeys = await ensureUserKeys(user, phoneNumber);
      handleSetCurrentUser(userWithKeys);
      return userWithKeys;
    } catch (err: any) {
      setError(err.message || 'OTP verification failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const phoneLogin = async (phoneNumber: string, displayName?: string): Promise<User> => {
    setLoading(true);
    setError(null);
    try {
      const user = await api.phoneLogin(phoneNumber, displayName);
      const userWithKeys = await ensureUserKeys(user, phoneNumber);
      handleSetCurrentUser(userWithKeys);
      return userWithKeys;
    } catch (err: any) {
      setError(err.message || 'Phone login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const googleSignIn = async (): Promise<User> => {
    setLoading(true);
    setError(null);
    try {
      const { signInWithGoogle } = require('../services/googleAuthService');
      const user = await signInWithGoogle();
      const secret = user.email || user.username;
      const userWithKeys = await ensureUserKeys(user, secret);
      handleSetCurrentUser(userWithKeys);
      return userWithKeys;
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = (): void => {
    handleSetCurrentUser(null);
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        loading,
        isInitializing,
        error,
        login,
        register,
        sendOtp,
        verifyOtp,
        phoneLogin,
        googleSignIn,
        logout,
        setCurrentUser: handleSetCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
