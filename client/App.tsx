import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Platform, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import ChatScreen from './src/screens/ChatScreen';
import GroupChatScreen from './src/screens/GroupChatScreen';
import CallModal from './src/components/CallModal';
import SplashScreen from './src/components/SplashScreen';
import InAppNotificationBanner, { NotificationBannerData } from './src/components/InAppNotificationBanner';
import callService from './src/services/callService';
import notificationService from './src/services/notificationService';
import cryptoService from './src/services/cryptoService';
import api from './src/config/api';
import { theme } from './src/theme/theme';
import { ChatContact, ChatGroup, CallState } from './src/types';

const INITIAL_CALL_STATE: CallState = {
  isActive: false,
  isIncoming: false,
  remoteUser: '',
  remoteDisplayName: '',
  remoteAvatar: '',
  isVideo: true,
  isAudioMuted: false,
  isVideoMuted: false,
  durationSeconds: 0,
  status: 'idle',
};

function MainNavigator() {
  const { currentUser, loading, isInitializing } = useAuth();
  const [activeChat, setActiveChat] = useState<ChatContact | null>(null);
  const [activeGroup, setActiveGroup] = useState<ChatGroup | null>(null);
  const [callState, setCallState] = useState<CallState>(INITIAL_CALL_STATE);
  const [splashFinished, setSplashFinished] = useState<boolean>(false);
  const [notificationData, setNotificationData] = useState<NotificationBannerData | null>(null);
  const activeChatRef = useRef<ChatContact | null>(null);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  // Initialize native notifications
  useEffect(() => {
    notificationService.init().catch(() => {});
  }, []);

  // Initialize WebRTC Signaling & Real-Time message notifications
  useEffect(() => {
    if (currentUser?.username) {
      callService.init(currentUser.username);

      const handleIncomingCall = (data: any) => {
        setCallState({
          isActive: true,
          isIncoming: true,
          remoteUser: data.from,
          remoteDisplayName: data.callerName || data.from,
          remoteAvatar: data.callerAvatar,
          isVideo: Boolean(data.isVideo),
          isAudioMuted: false,
          isVideoMuted: false,
          durationSeconds: 0,
          status: 'ringing',
        });
      };

      const handleCallConnected = () => {
        setCallState((prev) => ({
          ...prev,
          status: 'connected',
        }));
      };

      const handleCallEnded = () => {
        setCallState(INITIAL_CALL_STATE);
      };

      // Real-time incoming message notification handler
      const handleNewMessage = async (data: any) => {
        const msg = data.message;
        if (!msg) return;

        const sender = msg.sender;
        if (!sender || sender.toLowerCase() === currentUser.username.toLowerCase()) return;

        // If currently in active chat with this user, don't show floating notification
        const curActive = activeChatRef.current?.username || activeChatRef.current?.id;
        if (curActive && curActive.toLowerCase() === sender.toLowerCase()) {
          return;
        }

        let preview = msg.body || 'Sent an attachment';
        if (msg.message_type !== 'text' && msg.media_name) {
          preview = `[${(msg.message_type || 'file').toUpperCase()}] ${msg.media_name}`;
        } else if (msg.body && msg.encryption_iv && currentUser.private_key) {
          try {
            const senderPub = await api.getUserPublicKey(sender);
            if (senderPub) {
              preview = cryptoService.decryptTextMessage(msg.body, msg.encryption_iv, currentUser.private_key, senderPub);
            }
          } catch {}
        }

        // 1. Show in-app floating banner
        setNotificationData({
          id: msg.id || Date.now(),
          senderUsername: sender,
          senderName: sender,
          text: preview,
        });

        // 2. Show native system notification
        notificationService.showIncomingMessageNotification(sender, preview, {
          senderUsername: sender,
          messageId: msg.id,
        });
      };

      callService.on('incoming-call', handleIncomingCall);
      callService.on('call-connected', handleCallConnected);
      callService.on('call-ended', handleCallEnded);
      callService.on('new-message', handleNewMessage);

      return () => {
        callService.off('incoming-call', handleIncomingCall);
        callService.off('call-connected', handleCallConnected);
        callService.off('call-ended', handleCallEnded);
        callService.off('new-message', handleNewMessage);
      };
    }
  }, [currentUser?.username]);

  const handleStartCall = async (
    targetUser: string,
    isVideo: boolean,
    name?: string,
    avatar?: string
  ) => {
    if (!currentUser) return;

    if (Platform.OS !== 'web' && typeof RTCPeerConnection === 'undefined') {
      Alert.alert(
        'WebRTC Mobile Notice',
        'Direct peer-to-peer audio & video WebRTC calling on mobile requires a native development build (npx expo run:android). Please test calling across web browser windows at http://localhost:8081.'
      );
      return;
    }

    setCallState({
      isActive: true,
      isIncoming: false,
      remoteUser: targetUser,
      remoteDisplayName: name || targetUser,
      remoteAvatar: avatar,
      isVideo,
      isAudioMuted: false,
      isVideoMuted: false,
      durationSeconds: 0,
      status: 'ringing',
    });

    const stream = await callService.startCall(
      targetUser,
      isVideo,
      currentUser.display_name || currentUser.username,
      currentUser.avatar
    );

    if (!stream) {
      Alert.alert('Microphone / Camera Required', 'Could not access microphone or camera. Please check browser device permissions.');
      handleEndCall();
    }
  };

  const handleAcceptCall = async () => {
    if (Platform.OS !== 'web' && typeof RTCPeerConnection === 'undefined') {
      Alert.alert(
        'WebRTC Mobile Notice',
        'Direct peer-to-peer audio & video WebRTC calling on mobile requires a native development build (npx expo run:android). Please test calling across web browser windows at http://localhost:8081.'
      );
      handleEndCall();
      return;
    }

    const stream = await callService.acceptCall(callState.isVideo);
    if (!stream) {
      Alert.alert('Microphone / Camera Required', 'Could not access microphone or camera. Please check browser device permissions.');
      handleEndCall();
      return;
    }

    setCallState((prev) => ({
      ...prev,
      status: 'connected',
    }));
  };

  const handleEndCall = () => {
    callService.endCall();
    setCallState(INITIAL_CALL_STATE);
  };

  const handleRejectCall = () => {
    callService.rejectCall();
    setCallState(INITIAL_CALL_STATE);
  };

  const handleOpenChatFromNotification = (senderUsername: string) => {
    setActiveGroup(null);
    setActiveChat({
      id: senderUsername,
      username: senderUsername,
      name: senderUsername,
      avatar: '',
      lastMessage: '',
      time: 'Now',
      unreadCount: 0,
      isOnline: true,
      isGroup: false,
    });
    setNotificationData(null);
  };

  if (!currentUser && !isInitializing && splashFinished) {
    return <AuthScreen />;
  }

  return (
    <View style={styles.container}>
      {!currentUser ? (
        <AuthScreen />
      ) : activeGroup ? (
        <GroupChatScreen
          group={activeGroup}
          onBack={() => setActiveGroup(null)}
        />
      ) : activeChat ? (
        <ChatScreen
          contact={activeChat}
          onBack={() => setActiveChat(null)}
          onStartCall={(contact, isVideo) =>
            handleStartCall(contact.username || contact.id, isVideo, contact.name, contact.avatar)
          }
        />
      ) : (
        <HomeScreen
          onSelectChat={(chat: ChatContact) => {
            setActiveGroup(null);
            setActiveChat(chat);
          }}
          onSelectGroup={(group: ChatGroup) => {
            setActiveChat(null);
            setActiveGroup(group);
          }}
          onStartCall={(targetUser, isVideo, name, avatar) =>
            handleStartCall(targetUser, isVideo, name, avatar)
          }
        />
      )}

      {/* Real-time In-App Message Banner */}
      <InAppNotificationBanner
        data={notificationData}
        onPress={handleOpenChatFromNotification}
        onDismiss={() => setNotificationData(null)}
      />

      {/* Global WebRTC Audio / Video Call Modal */}
      <CallModal
        callState={callState}
        onEndCall={handleEndCall}
        onAcceptCall={handleAcceptCall}
        onRejectCall={handleRejectCall}
      />

      {/* Animated Project Splash Screen */}
      {!splashFinished && (
        <SplashScreen
          isReady={!isInitializing}
          onFinish={() => setSplashFinished(true)}
        />
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <View style={styles.container}>
          <MainNavigator />
          <StatusBar style="dark" />
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
});
