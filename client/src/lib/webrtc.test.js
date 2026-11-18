import { describe, expect, it } from 'vitest';
import { mediaErrorMessage, stopStream } from './webrtc';

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
