import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Platform, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import ChatScreen from './src/screens/ChatScreen';
import GroupChatScreen from './src/screens/GroupChatScreen';
import CallModal from './src/components/CallModal';
import callService from './src/services/callService';
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

  // Initialize WebRTC Signaling connection when user is authenticated
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

      callService.on('incoming-call', handleIncomingCall);
      callService.on('call-connected', handleCallConnected);
      callService.on('call-ended', handleCallEnded);

      return () => {
        callService.off('incoming-call', handleIncomingCall);
        callService.off('call-connected', handleCallConnected);
        callService.off('call-ended', handleCallEnded);
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

  if (isInitializing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  return (
    <View style={styles.container}>
      {activeGroup ? (
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

      {/* Global WebRTC Audio / Video Call Modal */}
      <CallModal
        callState={callState}
        onEndCall={handleEndCall}
        onAcceptCall={handleAcceptCall}
        onRejectCall={handleRejectCall}
      />
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
