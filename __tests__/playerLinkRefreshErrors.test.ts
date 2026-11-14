import {
  decidePlaybackError,
  getPlaybackErrorCode,
  PLAYBACK_RETRY_RESET_MS,
} from '../src/lib/player/playbackErrorRetry';

describe('playbackErrorRetry tests', () => {
  it('parses error codes from Android Media3 events', () => {
    expect(getPlaybackErrorCode({error: {errorCode: '22001'}})).toBe(2001);
    expect(getPlaybackErrorCode({error: {errorCode: '1001'}})).toBe(1001);
    expect(getPlaybackErrorCode(null)).toBeNull();
  });

  it('retries recoverable errors once before switching', () => {
    const stream = {id: 'stream-1'};
    const state = {
      stream,
      loadedAt: Date.now(),
      retried: false,
    };
    const error = {error: {errorCode: '22001'}}; // connection failed (network)
    const result = decidePlaybackError(state, stream, error, Date.now());
    expect(result.action).toBe('retry');
  });

  it('switches server when already retried', () => {
    const stream = {id: 'stream-1'};
    const state = {
      stream,
      loadedAt: Date.now(),
      retried: true,
    };
    const error = {error: {errorCode: '22001'}};
    const result = decidePlaybackError(state, stream, error, Date.now());
    expect(result.action).toBe('switch');
  });

  it('resets retry if playback persisted longer than threshold', () => {
    const stream = {id: 'stream-1'};
    const now = Date.now();
    const state = {
      stream,
      loadedAt: now - (PLAYBACK_RETRY_RESET_MS + 1000),
      retried: true,
    };
    const error = {error: {errorCode: '22001'}};
    const result = decidePlaybackError(state, stream, error, now);
    expect(result.action).toBe('retry');
  });
});
