// Universal safe stub for legacy unused native video/cast modules in Vega Komix
class DummyNativeComponent {}

module.exports = {
  default: DummyNativeComponent,
  Video: DummyNativeComponent,
  GoogleCast: {},
  CastContext: {
    getSharedInstance: () => ({
      getSessionManager: () => ({
        getCurrentCastSession: () => null,
        addSessionManagerListener: () => {},
        removeSessionManagerListener: () => {},
      }),
    }),
  },
  CastState: {},
  MediaInfo: {},
  MediaStatus: {},
  RemoteMediaClient: {},
  useCastDevice: () => null,
  useDevices: () => [],
  useCastChannel: () => [null, () => {}],
  useRemoteMediaClient: () => null,
  TextTrackType: {},
  RTCPeerConnection: class DummyRTCPeerConnection {},
  RTCSessionDescription: class DummyRTCSessionDescription {},
  RTCIceCandidate: class DummyRTCIceCandidate {},
};
