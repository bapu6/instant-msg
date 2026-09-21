import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SplashScreenProps {
  onFinish?: () => void;
  isReady: boolean;
}

const { width, height } = Dimensions.get('window');

export default function SplashScreen({ onFinish, isReady }: SplashScreenProps) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const textFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Initial entrance scale & fade
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(textFadeAnim, {
        toValue: 1,
        duration: 700,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle continuous pulse on glow ring
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    return () => {
      pulseLoop.stop();
    };
  }, []);

  useEffect(() => {
    if (isReady) {
      // Smooth exit transition once app is ready
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }).start(() => {
          onFinish?.();
        });
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0B101E" translucent />

      {/* Ambient background glow */}
      <Animated.View
        style={[
          styles.glowCircleOuter,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />
      <View style={styles.glowCircleInner} />

      {/* Center Logo & Emblem */}
      <Animated.View
        style={[
          styles.emblemContainer,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="chatbubbles" size={54} color="#FFFFFF" />
          <View style={styles.shieldBadge}>
            <Ionicons name="shield-checkmark" size={20} color="#25D366" />
          </View>
        </View>
      </Animated.View>

      {/* App Branding */}
      <Animated.View style={[styles.brandingContainer, { opacity: textFadeAnim }]}>
        <Text style={styles.title}>Instant Msg</Text>
        <View style={styles.taglineBadge}>
          <Ionicons name="lock-closed" size={12} color="#25D366" style={{ marginRight: 5 }} />
          <Text style={styles.tagline}>End-to-End Encrypted</Text>
        </View>
      </Animated.View>

      {/* Footer info */}
      <Animated.View style={[styles.footer, { opacity: textFadeAnim }]}>
        <Text style={styles.footerText}>Secure • Private • Instant</Text>
        <View style={styles.cryptoBadge}>
          <Text style={styles.cryptoText}>X25519 + AES-256-GCM</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 99999,
    backgroundColor: '#0B101E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowCircleOuter: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  glowCircleInner: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  emblemContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 30,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  shieldBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#25D366',
  },
  brandingContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  taglineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(37, 211, 102, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(37, 211, 102, 0.3)',
  },
  tagline: {
    fontSize: 13,
    fontWeight: '600',
    color: '#25D366',
    letterSpacing: 0.2,
  },
  footer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 44 : 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  cryptoBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  cryptoText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
