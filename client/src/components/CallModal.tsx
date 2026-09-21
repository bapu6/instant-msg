import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme/theme';
import callService from '../services/callService';
import ringtoneService from '../services/ringtoneService';
import { RTCView } from '../services/webrtc';
import { CallState } from '../types';

interface CallModalProps {
  callState: CallState;
  onEndCall: () => void;
  onAcceptCall: () => void;
  onRejectCall: () => void;
}

export default function CallModal({
  callState,
  onEndCall,
  onAcceptCall,
  onRejectCall,
}: CallModalProps) {
  const insets = useSafeAreaInsets();
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | null>(null);
  const [remoteStreamKey, setRemoteStreamKey] = useState(0);
  const [localStreamKey, setLocalStreamKey] = useState(0);
  const [isAudioAutoplayBlocked, setIsAudioAutoplayBlocked] = useState(false);

  const localVideoRef = useRef<any>(null);
  const remoteVideoRef = useRef<any>(null);
  const audioRef = useRef<any>(null);

  // Call timer
  useEffect(() => {
    let interval: any = null;
    if (callState.status === 'connected') {
      interval = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState.status]);

  // Ring tone & Ringback audio control — only when a real call is active
  useEffect(() => {
    if (callState.isActive && callState.status === 'ringing') {
      if (callState.isIncoming) {
        ringtoneService.playRingtone();
      } else {
        ringtoneService.playRingback();
      }
    } else {
      ringtoneService.stop();
    }

    return () => {
      ringtoneService.stop();
    };
  }, [callState.isActive, callState.status, callState.isIncoming]);

  // Attach MediaStreams on Web & Mobile
  useEffect(() => {
    const attachRemote = (stream: any) => {
      console.log('[CallModal] Attaching remote stream:', stream?.getTracks ? stream.getTracks().map((t: any) => `${t.kind}:${t.enabled}`) : stream);
      if (stream && typeof stream.toURL === 'function') {
        setRemoteStreamUrl(stream.toURL());
        setRemoteStreamKey((k) => k + 1);
      }
      if (Platform.OS === 'web') {
        // ALWAYS attach to audioRef for sound (in both audio AND video calls)
        if (audioRef.current) {
          if (audioRef.current.srcObject !== stream) {
            audioRef.current.srcObject = stream;
          }
          audioRef.current.play?.().catch((err: any) => {
            console.warn('[CallModal] remote audio play error:', err);
            if (err?.name === 'NotAllowedError') {
              setIsAudioAutoplayBlocked(true);
            }
          });
        }
        // Attach to remoteVideoRef for video display (muted=true avoids browser autoplay blocks)
        if (remoteVideoRef.current && callState.isVideo) {
          if (remoteVideoRef.current.srcObject !== stream) {
            remoteVideoRef.current.srcObject = stream;
          }
          remoteVideoRef.current.play?.().catch((err: any) => console.warn('[CallModal] remote video play error:', err));
        }
      }
    };

    const attachLocal = (stream: any) => {
      console.log('[CallModal] Attaching local stream:', stream?.getTracks ? stream.getTracks().map((t: any) => `${t.kind}:${t.enabled}`) : stream);
      if (stream && typeof stream.toURL === 'function') {
        setLocalStreamUrl(stream.toURL());
        setLocalStreamKey((k) => k + 1);
      }
      if (Platform.OS === 'web' && localVideoRef.current) {
        if (localVideoRef.current.srcObject !== stream) {
          localVideoRef.current.srcObject = stream;
        }
        localVideoRef.current.play?.().catch(() => {});
      }
    };

    const existingRemote = callService.getRemoteStream();
    if (existingRemote) attachRemote(existingRemote);

    const existingLocal = callService.getLocalStream();
    if (existingLocal) attachLocal(existingLocal);

    callService.on('local-stream', attachLocal);
    callService.on('remote-stream', attachRemote);

    return () => {
      callService.off('local-stream', attachLocal);
      callService.off('remote-stream', attachRemote);
    };
  }, [callState.status, callState.isVideo]);

  const handleToggleAudio = () => {
    const muted = callService.toggleMuteAudio();
    setIsAudioMuted(muted);
  };

  const handleToggleVideo = () => {
    const muted = callService.toggleMuteVideo();
    setIsVideoMuted(muted);
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (!callState.isActive) return null;

  return (
    <Modal visible={callState.isActive} transparent={false} animationType="slide">
      <View style={styles.container}>
        {/* Remote Video / Audio Placeholder View */}
        <View style={styles.remoteContainer}>
          {callState.isVideo && callState.status === 'connected' ? (
            Platform.OS === 'web' ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted={true}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  backgroundColor: '#000',
                }}
              />
            ) : RTCView && remoteStreamUrl ? (
              <RTCView
                key={remoteStreamKey}
                streamURL={remoteStreamUrl}
                style={styles.fullscreenVideo}
                objectFit="cover"
              />
            ) : (
              <View style={styles.audioPlaceholder}>
                <ActivityIndicator size="large" color="#FFF" />
                <Text style={styles.connectingText}>Connecting video...</Text>
              </View>
            )
          ) : (
            <View style={styles.audioPlaceholder}>
              <View style={styles.avatarWrapper}>
                <Avatar
                  uri={callState.remoteAvatar}
                  name={callState.remoteDisplayName || callState.remoteUser}
                  size={100}
                  style={styles.avatar}
                />
              </View>
              <Text style={styles.callerName}>{callState.remoteDisplayName || callState.remoteUser}</Text>
              <Text style={styles.callStatusText}>
                {callState.status === 'ringing'
                  ? callState.isIncoming
                    ? `Incoming ${callState.isVideo ? 'Video' : 'Audio'} Call...`
                    : 'Ringing...'
                  : `${callState.isVideo ? 'Video Call' : 'Audio Call'} • ${formatTimer(duration)}`}
              </Text>
            </View>
          )}

          {/* Unthrottled audio element on Web for remote audio playback */}
          {Platform.OS === 'web' && (
            <audio
              ref={audioRef}
              autoPlay
              playsInline
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Local PiP Preview (Video Call) */}
          {callState.isVideo &&
            (callState.status === 'connected' || (!callState.isIncoming && callState.status === 'ringing')) && (
              <View style={[styles.localPipContainer, { top: Math.max(insets.top, 24) + 20 }]}>
                {Platform.OS === 'web' ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted={true}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)', // Mirror local video
                    }}
                  />
                ) : RTCView && localStreamUrl ? (
                  <RTCView
                    key={localStreamKey}
                    streamURL={localStreamUrl}
                    style={styles.pipVideo}
                    objectFit="cover"
                    mirror={true}
                    zOrder={1}
                  />
                ) : null}
              </View>
            )}
        </View>

        {/* Top Info Overlay */}
        <View style={[styles.topBar, { top: Math.max(insets.top, 24) + 12 }]}>
          <View style={styles.secureTag}>
            <Ionicons name="lock-closed" size={12} color="#10B981" />
            <Text style={styles.secureText}>End-to-End Encrypted WebRTC</Text>
          </View>
        </View>

        {/* Tap to Unmute Banner if Browser Autoplay Policy blocks background audio */}
        {isAudioAutoplayBlocked && (
          <TouchableOpacity
            style={[styles.unmuteBanner, { top: Math.max(insets.top, 24) + 50 }]}
            onPress={() => {
              audioRef.current?.play?.();
              setIsAudioAutoplayBlocked(false);
            }}
          >
            <Ionicons name="volume-high" size={20} color="#FFF" />
            <Text style={styles.unmuteText}>Tap to enable audio</Text>
          </TouchableOpacity>
        )}

        {/* Bottom Call Controls */}
        <View style={[styles.controlsBar, { bottom: Math.max(insets.bottom, 20) + 16 }]}>
          {callState.isIncoming && callState.status === 'ringing' ? (
            // Incoming Call Action Buttons: Reject & Accept
            <View style={styles.incomingActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.declineBtn]}
                onPress={onRejectCall}
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={28} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
                <Text style={styles.btnLabel}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn]}
                onPress={onAcceptCall}
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={28} color="#FFF" />
                <Text style={styles.btnLabel}>Accept</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // Active Call Controls: Mute, Video, End
            <View style={styles.activeActions}>
              <TouchableOpacity
                style={[styles.iconControl, isAudioMuted && styles.controlActive]}
                onPress={handleToggleAudio}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isAudioMuted ? 'mic-off' : 'mic'}
                  size={24}
                  color={isAudioMuted ? '#EF4444' : '#FFF'}
                />
              </TouchableOpacity>

              {callState.isVideo && (
                <TouchableOpacity
                  style={[styles.iconControl, isVideoMuted && styles.controlActive]}
                  onPress={handleToggleVideo}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isVideoMuted ? 'videocam-off' : 'videocam'}
                    size={24}
                    color={isVideoMuted ? '#EF4444' : '#FFF'}
                  />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.iconControl, styles.hangupBtn]}
                onPress={onEndCall}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="call"
                  size={26}
                  color="#FFF"
                  style={{ transform: [{ rotate: '135deg' }] }}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A', // Deep slate
  },
  remoteContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    marginBottom: 20,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  callerName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  callStatusText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  localPipContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 110,
    height: 160,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  topBar: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  secureTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  secureText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  controlsBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    paddingHorizontal: 30,
  },
  incomingActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  declineBtn: {
    backgroundColor: '#EF4444',
  },
  acceptBtn: {
    backgroundColor: '#10B981',
  },
  btnLabel: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  activeActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderRadius: 40,
    paddingVertical: 12,
    paddingHorizontal: 24,
    gap: 24,
    alignSelf: 'center',
  },
  iconControl: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  hangupBtn: {
    backgroundColor: '#EF4444',
  },
  fullscreenVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  pipVideo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  connectingText: {
    color: '#FFF',
    marginTop: 12,
    fontSize: 14,
  },
  unmuteBanner: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    zIndex: 100,
    elevation: 10,
  },
  unmuteText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
