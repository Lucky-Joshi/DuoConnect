import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mediaErrorMessage,
  screenShareErrorMessage,
  screenShareSupport,
  stopStream,
} from './webrtc';

describe('media error messages', () => {
  it('maps permission denials to actionable copy', () => {
    expect(mediaErrorMessage({ name: 'NotAllowedError' })).toMatch(/blocked/i);
    expect(mediaErrorMessage({ name: 'NotFoundError' })).toMatch(/no camera or microphone/i);
    expect(mediaErrorMessage({ name: 'NotReadableError' })).toMatch(/already in use/i);
    expect(mediaErrorMessage({ name: 'OverconstrainedError' })).toMatch(
      /cannot provide|not available/i,
    );
    expect(mediaErrorMessage({ name: 'SomethingElse' })).toMatch(/could not access/i);
  });

  it('stops every track on a stream', () => {
    const stopped = [];
    const stream = {
      getTracks: () => [{ stop: () => stopped.push('a') }, { stop: () => stopped.push('b') }],
    };
    stopStream(stream);
    expect(stopped).toEqual(['a', 'b']);
    expect(() => stopStream(null)).not.toThrow();
  });
});

describe('screen share support', () => {
  const originalSecureContext = window.isSecureContext;
  const originalMediaDevices = navigator.mediaDevices;

  function setSecureContext(value) {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value });
  }

  function setMediaDevices(value) {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value });
  }

  afterEach(() => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: originalSecureContext,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
    vi.restoreAllMocks();
  });

  it('is available in a secure context with getDisplayMedia', () => {
    setSecureContext(true);
    const getDisplayMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [] });
    setMediaDevices({ getDisplayMedia });

    const support = screenShareSupport();
    expect(support.supported).toBe(true);
    support.getDisplayMedia({ video: true });
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true });
  });

  it('falls back to the prefixed API', () => {
    setSecureContext(true);
    setMediaDevices({ webkitGetDisplayMedia: vi.fn() });
    expect(screenShareSupport().supported).toBe(true);
  });

  it('reports insecure contexts distinctly', () => {
    setSecureContext(false);
    const result = screenShareSupport();
    expect(result.supported).toBe(false);
    expect(result.reason).toBe('insecure');
    expect(screenShareErrorMessage(result.reason)).toMatch(/https|localhost/i);
  });

  it('reports browsers without the API', () => {
    setSecureContext(true);
    setMediaDevices({});
    const result = screenShareSupport();
    expect(result.supported).toBe(false);
    expect(result.reason).toBe('unsupported');
    expect(screenShareErrorMessage(result.reason)).toMatch(/chrome|edge|firefox/i);
  });
});
