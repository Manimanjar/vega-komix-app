const mockSetEnabled = jest.fn(async () => undefined);

jest.mock('react-native', () => ({
  Platform: {OS: 'android'},
  NativeModules: {
    VegaVideoIntent: {
      setEnabled: (...args: unknown[]) => mockSetEnabled(...args),
    },
  },
}));

import {
  setVideoIntentsEnabled,
  supportsVideoIntents,
} from '../src/lib/services/videoIntent';
const {addVideoPlayerAlias} = require('../plugins/video-player-intents');

beforeEach(() => jest.clearAllMocks());

it('reports video intents as supported on Android when the native module exists', () => {
  expect(supportsVideoIntents).toBe(true);
});

it('disables video intents at the OS level and surfaces failure instead of claiming success', async () => {
  await setVideoIntentsEnabled(false);
  expect(mockSetEnabled).toHaveBeenCalledWith(false);
  mockSetEnabled.mockRejectedValueOnce(new Error('Package manager failed'));
  await expect(setVideoIntentsEnabled(true)).rejects.toThrow(
    'Package manager failed',
  );
});

it('exposes no video-intent subscription, parsing, or player-param helpers anymore', () => {
  const moduleExports = require('../src/lib/services/videoIntent');
  expect(moduleExports.subscribeVideoIntent).toBeUndefined();
  expect(moduleExports.parseVideoIntent).toBeUndefined();
  expect(moduleExports.getInitialVideoIntent).toBeUndefined();
  expect(moduleExports.videoIntentPlayerParams).toBeUndefined();
  expect(moduleExports.externalVideoStream).toBeUndefined();
  expect(moduleExports.setVideoIntentsEnabled).toBeDefined();
});

it('adds a separately switchable video alias without replacing launcher aliases or claiming general web links', () => {
  const launcher = {$: {'android:name': '.LauncherDefault'}};
  const application = {'activity-alias': [launcher]};
  addVideoPlayerAlias(application);
  addVideoPlayerAlias(application);
  expect(application['activity-alias']).toHaveLength(2);
  expect(application['activity-alias'][0]).toBe(launcher);
  const alias: any = application['activity-alias'][1];
  expect(alias.$['android:targetActivity']).toBe('.MainActivity');
  expect(alias.$['android:enabled']).toBe('true');
  const view = alias['intent-filter'][0];
  expect(
    view.data.some((item: any) => item.$['android:mimeType'] === 'video/*'),
  ).toBe(true);
  expect(
    view.data.some((item: any) => item.$['android:mimeType'] === '*/*'),
  ).toBe(false);
});
