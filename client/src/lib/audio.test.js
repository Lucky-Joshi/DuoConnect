import { describe, expect, it } from 'vitest';
import { rmsLevel } from './audio';

describe('rmsLevel', () => {
  it('reports silence for a flat 8-bit frame', () => {
    expect(rmsLevel(new Uint8Array(64).fill(128))).toBe(0);
  });

  it('reports near-full level for a loud alternating frame', () => {
    const samples = Uint8Array.from({ length: 64 }, (_, index) => (index % 2 ? 255 : 0));
    expect(rmsLevel(samples)).toBeGreaterThan(0.9);
  });

  it('scales between silence and full level', () => {
    const quiet = rmsLevel(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 133 : 123)));
    const loud = rmsLevel(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 200 : 56)));
    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(quiet);
    expect(quiet).toBeLessThan(0.05);
  });

  it('handles missing frames', () => {
    expect(rmsLevel(null)).toBe(0);
    expect(rmsLevel(new Uint8Array())).toBe(0);
  });
});
