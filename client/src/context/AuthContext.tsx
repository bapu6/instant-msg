import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import api from '../config/api';
import { User, AuthContextType } from '../types';
import { saveUserSession, getUserSession, clearUserSession } from '../services/sessionStorage';
import { sendFirebasePhoneOtp, verifyFirebasePhoneOtp } from '../services/firebaseAuthService';

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
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
          console.log('🔄 [AuthContext] Restored user session:', savedUser.username);
          setCurrentUser(savedUser);
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
      handleSetCurrentUser(user);
      return user;
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
      handleSetCurrentUser(user);
      return user;
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async (phoneNumber: string): Promise<{ success: boolean; debugCode?: string }> => {
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
      handleSetCurrentUser(user);
      return user;
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
      handleSetCurrentUser(user);
      return user;
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
      handleSetCurrentUser(user);
      return user;
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
