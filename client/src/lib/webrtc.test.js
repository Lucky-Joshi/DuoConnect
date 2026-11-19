import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mediaErrorMessage,
  requestDisplayMedia,
  screenCaptureErrorMessage,
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
  const originalUserAgent = navigator.userAgent;

  function setSecureContext(value) {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value });
  }

  function setMediaDevices(value) {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value });
  }

  function setUserAgent(value) {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value });
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
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
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

  it('reports mobile devices distinctly', () => {
    setSecureContext(true);
    setMediaDevices({});
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148');
    const result = screenShareSupport();
    expect(result.supported).toBe(false);
    expect(result.reason).toBe('mobile');
    expect(screenShareErrorMessage(result.reason)).toMatch(/desktop|computer/i);
  });

  it('reports browsers without the API', () => {
    setSecureContext(true);
    setMediaDevices({});
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120');
    const result = screenShareSupport();
    expect(result.supported).toBe(false);
    expect(result.reason).toBe('unsupported');
    expect(screenShareErrorMessage(result.reason)).toMatch(/chrome|edge|firefox/i);
  });

  it('explains embedded frames and unsupported browsers', () => {
    expect(screenShareErrorMessage('embedded')).toMatch(/own tab|frame/i);
    expect(screenShareErrorMessage('unsupported')).toMatch(/chrome|edge|firefox/i);
  });
});

describe('requestDisplayMedia', () => {
  const originalMediaDevices = navigator.mediaDevices;

  function setMediaDevices(value) {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value });
  }

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
    vi.restoreAllMocks();
  });

  it('calls the standard API with the requested constraints', async () => {
    const stream = { getVideoTracks: () => [] };
    const getDisplayMedia = vi.fn().mockResolvedValue(stream);
    setMediaDevices({ getDisplayMedia });

    await expect(requestDisplayMedia({ video: true, audio: false })).resolves.toBe(stream);
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
  });

  it('falls back to the prefixed API', async () => {
    const getDisplayMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [] });
    setMediaDevices({ webkitGetDisplayMedia: getDisplayMedia });

    await requestDisplayMedia({ video: true });
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true });
  });

  it('throws a named error when no API exists', async () => {
    setMediaDevices({});
    await expect(requestDisplayMedia()).rejects.toMatchObject({
      name: 'ScreenCaptureUnavailable',
    });
  });
});

describe('screen capture error messages', () => {
  it('explains missing APIs, secure-context failures, and cancellations', () => {
    expect(screenCaptureErrorMessage({ name: 'ScreenCaptureUnavailable' })).toMatch(
      /chrome|edge|firefox/i,
    );
    expect(screenCaptureErrorMessage({ name: 'SecurityError' })).toMatch(/https|localhost/i);
    expect(screenCaptureErrorMessage({ name: 'NotAllowedError' })).toMatch(/cancelled or blocked/i);
    expect(screenCaptureErrorMessage({ name: 'AbortError' })).toMatch(/cancelled or blocked/i);
    expect(screenCaptureErrorMessage({ name: 'NotSupportedError' })).toMatch(
      /chrome|edge|firefox/i,
    );
    expect(screenCaptureErrorMessage({ name: 'Unknown' })).toMatch(/could not be started/i);
  });
});
