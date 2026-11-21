import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Primitives';

const user = { id: 'u1', displayName: 'Lucky Joshi', username: 'lucky_joshi18' };

describe('Avatar presence dot', () => {
  it('stays a circle instead of inheriting the initials wrapper height', () => {
    const { container } = render(<Avatar user={user} size="xxl" showStatus status="online" ring />);

    const dot = container.querySelector('[aria-label="Online"]');
    expect(dot).not.toBeNull();

    const style = window.getComputedStyle(dot);
    expect(style.width).toBe(style.height);
    expect(style.borderRadius).toBe('50%');
  });

  it('does not apply the initials styling to the presence dot', () => {
    const { container } = render(<Avatar user={user} size="xxl" showStatus status="away" />);

    const dot = container.querySelector('[aria-label="Away"]');
    const initials = container.querySelector('[class*="avatarInitials"]');
    expect(initials).not.toBeNull();
    expect(dot?.className).not.toBe(initials?.className);
  });
});
