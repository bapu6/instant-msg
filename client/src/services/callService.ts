import { Platform } from 'react-native';
import { API_BASE_URL, getHostIp } from '../config/api';
import {
  RTCPeerConnection as WebRTCPeerConnection,
  RTCIceCandidate as WebRTCIceCandidate,
  RTCSessionDescription as WebRTCSessionDescription,
  MediaStream as WebRTCMediaStream,
  mediaDevices as webRTCMediaDevices,
} from './webrtc';

const getWsUrl = (): string => {
  const url = API_BASE_URL.replace(/^http/, 'ws');
  return `${url}/ws/signaling`;
};

const getRtcConfig = (): any => {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:3.121.186.237:3478' },
      {
        urls: [
          'turn:3.121.186.237:3478?transport=udp',
          'turn:3.121.186.237:3478?transport=tcp',
          'turn:3.121.186.237.sslip.io:3478?transport=udp',
          'turn:3.121.186.237.sslip.io:3478?transport=tcp',
        ],
        username: 'instantmsg',
        credential: 'secretturnpass123',
      },
    ],
    iceCandidatePoolSize: 10,
  };
};

type CallEventCallback = (...args: any[]) => void;

class CallService {
  private ws: WebSocket | null = null;
  private peerConnection: any = null;
  private localStream: any = null;
  private remoteStream: any = null;
  private currentTargetUser: string | null = null;
  private currentUsername: string | null = null;
  private pendingOffer: any = null;
  private iceCandidateQueue: any[] = [];
  private listeners: Map<string, Set<CallEventCallback>> = new Map();

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  public init(username: string) {
    if (this.currentUsername === username && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    this.currentUsername = username;
    this.connectWs();
  }

  private connectWs() {
    try {
      this.ws = new WebSocket(getWsUrl());

      this.ws.onopen = () => {
        if (this.currentUsername) {
          this.sendWs({
            type: 'register',
            username: this.currentUsername,
          });
        }
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleSignalingMessage(data);
        } catch (err) {
          console.error('[CallService] WS message parse error:', err);
        }
      };

      this.ws.onclose = () => {
        // Reconnect after delay
        setTimeout(() => {
          if (this.currentUsername) {
            this.connectWs();
          }
        }, 3000);
      };

      this.ws.onerror = (err) => {
        console.warn('[CallService] WebSocket connection error:', err);
      };
    } catch (err) {
      console.error('[CallService] WS init error:', err);
    }
  }

  private sendWs(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private async flushIceCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    const IC = WebRTCIceCandidate || (typeof RTCIceCandidate !== 'undefined' ? RTCIceCandidate : null);
    while (this.iceCandidateQueue.length > 0) {
      const candidate = this.iceCandidateQueue.shift();
      try {
        const cand = IC ? new IC(candidate) : candidate;
        await this.peerConnection.addIceCandidate(cand);
      } catch (err) {
        console.error('[CallService] Error adding queued ICE candidate:', err);
      }
    }
  }

  private async handleSignalingMessage(data: any) {
    const { type } = data;

    switch (type) {
      case 'incoming-call': {
        this.currentTargetUser = data.from;
        this.pendingOffer = data.offer;
        this.emit('incoming-call', {
          from: data.from,
          isVideo: data.isVideo,
          callerName: data.callerName || data.from,
          callerAvatar: data.callerAvatar,
        });
        break;
      }

      case 'call-accepted': {
        if (this.peerConnection && data.answer) {
          const SD = WebRTCSessionDescription || (typeof RTCSessionDescription !== 'undefined' ? RTCSessionDescription : null);
          const desc = SD ? new SD(data.answer) : data.answer;
          await this.peerConnection.setRemoteDescription(desc);
          await this.flushIceCandidates();
          this.emit('call-connected', {});
        }
        break;
      }

      case 'ice-candidate': {
        if (!data.candidate) break;
        if (this.peerConnection && this.peerConnection.remoteDescription) {
          try {
            const IC = WebRTCIceCandidate || (typeof RTCIceCandidate !== 'undefined' ? RTCIceCandidate : null);
            const cand = IC ? new IC(data.candidate) : data.candidate;
            await this.peerConnection.addIceCandidate(cand);
          } catch (err) {
            console.error('[CallService] Error adding ICE candidate:', err);
          }
        } else {
          this.iceCandidateQueue.push(data.candidate);
        }
        break;
      }

      case 'call-ended':
      case 'call-rejected': {
        this.cleanupCall();
        this.emit('call-ended', { reason: type });
        break;
      }

      case 'new-message': {
        this.emit('new-message', data);
        break;
      }

      case 'new-group-message': {
        this.emit('new-group-message', data);
        break;
      }

      case 'typing-status': {
        this.emit('typing-status', data);
        break;
      }

      default:
        break;
    }
  }

  /**
   * Broadcast typing / stopped typing status to target user
   */
  public sendTypingStatus(to: string, isTyping: boolean) {
    if (to && this.currentUsername) {
      this.sendWs({
        type: 'typing',
        to: to.toLowerCase(),
        from: this.currentUsername.toLowerCase(),
        isTyping: Boolean(isTyping),
      });
    }
  }

  /**
   * Start an outgoing call
   */
  public async startCall(
    targetUser: string,
    isVideo: boolean,
    callerName?: string,
    callerAvatar?: string
  ): Promise<MediaStream | null> {
    this.currentTargetUser = targetUser;

    // 1. Get user media (camera/mic)
    const stream = await this.setupLocalMedia(isVideo);
    if (!stream) return null;

    // 2. Setup RTCPeerConnection
    this.createPeerConnection();

    // 3. Create Offer
    if (this.peerConnection) {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: isVideo,
      });
      await this.peerConnection.setLocalDescription(offer);

      // 4. Send offer via WebSocket signaling
      this.sendWs({
        type: 'call-user',
        to: targetUser,
        from: this.currentUsername,
        isVideo,
        offer,
        callerName,
        callerAvatar,
      });
    }

    return this.localStream;
  }

  /**
   * Accept an incoming call
   */
  public async acceptCall(isVideo: boolean): Promise<MediaStream | null> {
    if (!this.currentTargetUser || !this.pendingOffer) return null;

    // 1. Setup local media
    const stream = await this.setupLocalMedia(isVideo);
    if (!stream) return null;

    // 2. Setup RTCPeerConnection
    this.createPeerConnection();

    if (this.peerConnection) {
      // 3. Set remote description from offer
      const SD = WebRTCSessionDescription || (typeof RTCSessionDescription !== 'undefined' ? RTCSessionDescription : null);
      const desc = SD ? new SD(this.pendingOffer) : this.pendingOffer;
      await this.peerConnection.setRemoteDescription(desc);
      await this.flushIceCandidates();

      // 4. Create answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // 5. Send answer
      this.sendWs({
        type: 'call-accepted',
        to: this.currentTargetUser,
        from: this.currentUsername,
        answer,
      });

      this.pendingOffer = null;
      this.emit('call-connected', {});
    }

    return this.localStream;
  }

  public rejectCall() {
    if (this.currentTargetUser) {
      this.sendWs({
        type: 'reject-call',
        to: this.currentTargetUser,
        from: this.currentUsername,
      });
    }
    this.cleanupCall();
  }

  public endCall() {
    if (this.currentTargetUser) {
      this.sendWs({
        type: 'end-call',
        to: this.currentTargetUser,
        from: this.currentUsername,
      });
    }
    this.cleanupCall();
    this.emit('call-ended', { reason: 'local-hangup' });
  }

  private async setupLocalMedia(isVideo: boolean): Promise<any | null> {
    try {
      const md = webRTCMediaDevices || (typeof navigator !== 'undefined' ? navigator.mediaDevices : null);
      if (!md || !md.getUserMedia) {
        console.warn('[CallService] mediaDevices.getUserMedia not available');
        return null;
      }

      // Tailor video constraints: desktop webcams reject `facingMode: 'user'`, mobile needs it for front camera
      const videoConstraints = isVideo ? (
        Platform.OS === 'web'
          ? { width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      ) : false;

      console.log('[CallService] Requesting userMedia with video constraint:', videoConstraints);

      try {
        this.localStream = await md.getUserMedia({
          audio: true,
          video: videoConstraints,
        });
      } catch (err: any) {
        console.warn('[CallService] getUserMedia with constraints failed:', err?.message || err);
        if (isVideo) {
          try {
            console.log('[CallService] Retrying with generic video: true...');
            this.localStream = await md.getUserMedia({ audio: true, video: true });
          } catch (err2: any) {
            console.warn('[CallService] Retrying with video: true failed:', err2?.message || err2);
            try {
              console.log('[CallService] Falling back to audio-only stream...');
              this.localStream = await md.getUserMedia({ audio: true, video: false });
            } catch (err3: any) {
              console.error('[CallService] Audio fallback also failed:', err3);
            }
          }
        }
      }

      if (this.localStream) {
        this.localStream.getAudioTracks?.().forEach((t: any) => { t.enabled = true; });
        this.localStream.getVideoTracks?.().forEach((t: any) => { t.enabled = true; });
        console.log(
          '[CallService] Local stream acquired. Tracks:',
          this.localStream.getTracks?.().map((t: any) => `${t.kind}:${t.enabled}`)
        );
        this.emit('local-stream', this.localStream);
        return this.localStream;
      }
    } catch (err) {
      console.error('[CallService] setupLocalMedia fatal error:', err);
    }
    return null;
  }

  private createPeerConnection() {
    const PC = WebRTCPeerConnection || (typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null);
    if (!PC) {
      console.warn('[CallService] RTCPeerConnection is not supported in this environment');
      return;
    }

    this.peerConnection = new PC(getRtcConfig());

    // Add local tracks to connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => {
        track.enabled = true;
        console.log('[CallService] Adding local track to connection:', track.kind, track.id);
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    // Handle remote tracks robustly for both audio and video
    this.peerConnection.ontrack = (event: any) => {
      console.log('[CallService] ontrack event received:', event.track?.kind, event.track?.id);
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        if (!this.remoteStream) {
          const MS = WebRTCMediaStream || (typeof MediaStream !== 'undefined' ? MediaStream : null);
          this.remoteStream = MS ? new MS() : null;
        }
        if (this.remoteStream && event.track) {
          this.remoteStream.addTrack(event.track);
        }
      }
      if (this.remoteStream) {
        this.remoteStream.getAudioTracks?.().forEach((t: any) => { t.enabled = true; });
        this.remoteStream.getVideoTracks?.().forEach((t: any) => { t.enabled = true; });
        console.log(
          '[CallService] Remote stream updated. Tracks:',
          this.remoteStream.getTracks?.().map((t: any) => `${t.kind}:${t.enabled}`)
        );
        this.emit('remote-stream', this.remoteStream);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[CallService] ICE connection state:', this.peerConnection?.iceConnectionState);
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('[CallService] Connection state:', this.peerConnection?.connectionState);
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event: any) => {
      if (event.candidate && this.currentTargetUser) {
        this.sendWs({
          type: 'ice-candidate',
          to: this.currentTargetUser,
          from: this.currentUsername,
          candidate: event.candidate,
        });
      }
    };
  }

  public toggleMuteAudio(): boolean {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return !audioTrack.enabled; // returns isMuted
      }
    }
    return false;
  }

  public toggleMuteVideo(): boolean {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return !videoTrack.enabled; // returns isMuted
      }
    }
    return false;
  }

  private cleanupCall() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => track.stop());
      this.localStream = null;
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track: any) => track.stop());
      this.remoteStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.currentTargetUser = null;
    this.pendingOffer = null;
    this.iceCandidateQueue = [];
  }

  // Event emitter methods
  public on(event: string, cb: CallEventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
  }

  public off(event: string, cb: CallEventCallback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(cb);
    }
  }

  private emit(event: string, ...args: any[]) {
    const cbs = this.listeners.get(event);
    if (cbs) {
      cbs.forEach((cb) => cb(...args));
    }
  }
}

export default new CallService();
