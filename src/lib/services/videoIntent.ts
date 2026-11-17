import {NativeModules, Platform} from 'react-native';

/**
 * External video intents, reduced to the one thing this comic reader still
 * needs: turning them OFF.
 *
 * The Android manifest declares a VideoPlayer activity-alias (ACTION_VIEW
 * for video) that defaults to enabled, and the old code routed incoming
 * videos into the comic reader, which failed with "Unable to load chapter"
 * — the reader has no video playback. App.tsx calls setVideoIntentsEnabled
 * (false) on every start so the OS stops offering this app for videos.
 * Nothing in the app subscribes to video intents or builds video player
 * params from them anymore; the parsing/subscription helpers were deleted.
 */

const native = NativeModules.VegaVideoIntent;
export const supportsVideoIntents =
  Platform.OS === 'android' && Boolean(native);

export const setVideoIntentsEnabled = async (
  enabled: boolean,
): Promise<void> => {
  if (!supportsVideoIntents)
    throw new Error(
      'Opening videos from other apps requires an updated Android app.',
    );
  await native.setEnabled(enabled);
};
