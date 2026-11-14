declare module 'react-native-screens' {
  export const enableFreeze: (enable?: boolean) => void;
  export const enableScreens: (enable?: boolean) => void;
}

declare module 'expo-camera' {
  export const CameraView: any;
  export const useCameraPermissions: any;
}

declare module 'react-native-video' {
  import type * as React from 'react';
  import type {ViewProps} from 'react-native';

  export interface VideoRef {
    seek: (time: number, tolerance?: number) => void;
    resume: () => void;
    pause: () => void;
    presentFullscreenPlayer?: () => void;
    dismissFullscreenPlayer?: () => void;
    restoreUserInterfaceForPictureInPictureStopCompleted?: (restore: boolean) => void;
    setVolume?: (volume: number) => void;
    enterPictureInPicture: () => void;
  }

  export enum ResizeMode {
    NONE = 'none',
    CONTAIN = 'contain',
    COVER = 'cover',
    STRETCH = 'stretch',
  }

  export enum SelectedVideoTrackType {
    AUTO = 'auto',
    DISABLED = 'disabled',
    RESOLUTION = 'resolution',
    INDEX = 'index',
  }

  export enum SelectedTrackType {
    SYSTEM = 'system',
    DISABLED = 'disabled',
    TITLE = 'title',
    LANGUAGE = 'language',
    INDEX = 'index',
  }

  export enum BufferingStrategyType {
    DEFAULT = 'Default',
    DISABLE_BUFFERING = 'DisableBuffering',
    DEPENDING_ON_MEMORY = 'DependingOnMemory',
  }

  export enum ViewType {
    TEXTURE = 0,
    SURFACE = 1,
  }

  export enum TextTrackType {
    SUBRIP = 'application/x-subrip',
    TTML = 'application/ttml+xml',
    VTT = 'text/vtt',
  }

  export interface SelectedTrack {
    type: SelectedTrackType;
    value?: string | number;
  }

  export interface SelectedVideoTrack {
    type: SelectedVideoTrackType;
    value?: string | number;
  }

  export interface OnLoadData {
    currentTime: number;
    duration: number;
    naturalSize: {
      width: number;
      height: number;
      orientation: 'portrait' | 'landscape';
    };
    audioTracks: any[];
    textTracks: any[];
    videoTracks: any[];
    currentPlaybackTime?: number;
  }

  export interface OnLoadStartData {
    isNetwork: boolean;
    type: string;
    uri: string;
  }

  export interface OnProgressData {
    currentTime: number;
    playableDuration: number;
    seekableDuration: number;
    currentPlaybackTime?: number;
  }

  export interface OnSeekData {
    currentTime: number;
    seekTime: number;
  }

  export interface Drm {
    type?: string;
    licenseServer?: string;
    headers?: Record<string, string>;
    contentId?: string;
    certificateUrl?: string;
    base64Certificate?: boolean;
    multiDrm?: boolean;
    clearKeys?: Record<string, string>;
  }

  export interface ReactVideoProps extends ViewProps {
    source?: any;
    poster?: string;
    posterResizeMode?: ResizeMode | string;
    resizeMode?: ResizeMode | string;
    repeat?: boolean;
    paused?: boolean;
    muted?: boolean;
    volume?: number;
    rate?: number;
    controls?: boolean;
    currentTime?: number;
    progressUpdateInterval?: number;
    onLoad?: (data: OnLoadData) => void;
    onLoadStart?: (data: OnLoadStartData) => void;
    onProgress?: (data: OnProgressData) => void;
    onSeek?: (data: OnSeekData) => void;
    onEnd?: () => void;
    onError?: (error: any) => void;
    onBuffer?: (data: any) => void;
    onPlaybackStalled?: () => void;
    onPlaybackResume?: () => void;
    onReadyForDisplay?: () => void;
    selectedAudioTrack?: SelectedTrack;
    selectedTextTrack?: SelectedTrack;
    selectedVideoTrack?: SelectedVideoTrack;
    textTracks?: any[];
    bufferingStrategy?: BufferingStrategyType;
    viewType?: ViewType;
    bufferConfig?: any;
    drm?: Drm;
    preventsDisplaySleepDuringVideoPlayback?: boolean;
    pictureInPicture?: boolean;
    playInBackground?: boolean;
    playWhenInactive?: boolean;
    ignoreSilentSwitch?: 'inherit' | 'ignore' | 'obey';
    allowsExternalPlayback?: boolean;
    onPictureInPictureStatusChanged?: (event: any) => void;
    useTextureView?: boolean;
    animatedProps?: any;
  }

  const Video: React.ForwardRefExoticComponent<
    ReactVideoProps & React.RefAttributes<VideoRef>
  >;

  export default Video;
}

declare module 'react-native-google-cast' {
  export const CastButton: any;

  export enum MediaPlayerIdleReason {
    NONE = 'none',
    FINISHED = 'finished',
    CANCELED = 'canceled',
    INTERRUPTED = 'interrupted',
    ERROR = 'error',
  }

  export enum MediaPlayerState {
    UNKNOWN = 'unknown',
    IDLE = 'idle',
    PLAYING = 'playing',
    PAUSED = 'paused',
    BUFFERING = 'buffering',
    LOADING = 'loading',
  }

  export interface MediaStatus {
    playerState?: MediaPlayerState;
    idleReason?: MediaPlayerIdleReason;
    streamPosition?: number;
    mediaInfo?: any;
    supportedMediaCommands?: number;
  }

  export interface CastDevice {
    deviceId: string;
    friendlyName: string;
    modelName?: string;
    ipAddress?: string;
  }

  export interface RemoteMediaClient {
    loadMedia: (mediaInfo: any, options?: any) => Promise<any>;
    play: () => Promise<any>;
    pause: () => Promise<any>;
    stop: () => Promise<any>;
    seek: (options: {position: number}) => Promise<any>;
    setStreamVolume: (volume: number) => Promise<any>;
    onMediaStatusUpdated: (listener: (status: any) => void) => {remove: () => void};
    onMediaProgressUpdated: (listener: (progress: any, duration: any) => void, interval?: number) => {remove: () => void};
    getMediaStatus: () => Promise<MediaStatus | null>;
    setActiveTrackIds: (trackIds: number[]) => Promise<any>;
    setPlaybackRate: (rate: number) => Promise<any>;
  }

  export function useCastDevice(options?: any): CastDevice | null;
  export function useDevices(): CastDevice[];
  export function useRemoteMediaClient(options?: any): RemoteMediaClient | null;
  export function useMediaStatus(): MediaStatus | null;
  export function useStreamPosition(interval?: number): number;

  export interface CastSessionManager {
    startSession: (deviceId: string) => Promise<boolean>;
    getCurrentCastSession: () => Promise<any>;
    endCurrentSession: (stopCasting?: boolean) => Promise<any>;
    onSessionEnded: (listener: (session?: any) => void) => {remove: () => void};
    onSessionEnding: (listener: (session?: any) => void) => {remove: () => void};
    onSessionStarted: (listener: (session?: any) => void) => {remove: () => void};
    onSessionStarting: (listener: (session?: any) => void) => {remove: () => void};
    onSessionSuspended: (listener: (session?: any) => void) => {remove: () => void};
    onSessionResumed: (listener: (session?: any) => void) => {remove: () => void};
    onSessionStartFailed: (listener: (session?: any, error?: any) => void) => {remove: () => void};
  }

  const GoogleCast: {
    showCastDialog: () => Promise<void>;
    showExpandedControls: () => void;
    getCastState: () => Promise<string>;
    getSessionManager: () => CastSessionManager;
    SESSION_STARTING: string;
    SESSION_STARTED: string;
    SESSION_START_FAILED: string;
    SESSION_SUSPENDED: string;
    SESSION_RESUMING: string;
    SESSION_RESUMED: string;
    SESSION_ENDING: string;
    SESSION_ENDED: string;
  };

  export default GoogleCast;
}

declare module 'react-native-webrtc' {
  export class RTCPeerConnection {
    constructor(configuration?: any);
    createOffer: (options?: any) => Promise<any>;
    createAnswer: (options?: any) => Promise<any>;
    setLocalDescription: (description: any) => Promise<void>;
    setRemoteDescription: (description: any) => Promise<void>;
    addIceCandidate: (candidate: any) => Promise<void>;
    createDataChannel: (label: string, dataChannelDict?: any) => any;
    close: () => void;
    addEventListener: (type: string, listener: (event: any) => void) => void;
    removeEventListener: (type: string, listener: (event: any) => void) => void;
    localDescription: any;
    remoteDescription?: any;
    onicecandidate: ((event: any) => void) | null;
    ondatachannel: ((event: any) => void) | null;
    onconnectionstatechange: ((event: any) => void) | null;
  }

  export class RTCSessionDescription {
    constructor(descriptionInitDict?: any);
    type: string;
    sdp: string;
  }

  export class RTCIceCandidate {
    constructor(candidateInfo?: any);
    candidate: string;
    sdpMLineIndex?: number;
    sdpMid?: string;
  }
}

declare module 'react-native-webrtc/lib/typescript/RTCDataChannel' {
  export default interface RTCDataChannel {
    label: string;
    readyState: string;
    bufferedAmount: number;
    send: (data: string | ArrayBuffer | ArrayBufferView) => void;
    close: () => void;
    addEventListener: (type: string, listener: (event: any) => void) => void;
    removeEventListener: (type: string, listener: (event: any) => void) => void;
    onopen: ((event: any) => void) | null;
    onclose: ((event: any) => void) | null;
    onmessage: ((event: any) => void) | null;
    onerror: ((event: any) => void) | null;
  }
}
