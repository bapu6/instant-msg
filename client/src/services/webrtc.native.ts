import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStream,
  mediaDevices,
  registerGlobals,
} from 'react-native-webrtc';

// Polyfill standard WebRTC globals on native mobile
try {
  registerGlobals();
} catch (e) {
  console.warn('[WebRTC] registerGlobals warning:', e);
}

export {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStream,
  mediaDevices,
};
