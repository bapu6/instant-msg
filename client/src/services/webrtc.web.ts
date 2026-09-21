const RTCPeerConnection = typeof window !== 'undefined' ? window.RTCPeerConnection : (null as any);
const RTCIceCandidate = typeof window !== 'undefined' ? window.RTCIceCandidate : (null as any);
const RTCSessionDescription = typeof window !== 'undefined' ? window.RTCSessionDescription : (null as any);
const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : (null as any);
const MediaStream = typeof window !== 'undefined' ? window.MediaStream : (null as any);
const RTCView: any = null;

export {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStream,
  mediaDevices,
};
