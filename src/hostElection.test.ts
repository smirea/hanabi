import { describe, expect, test } from 'bun:test';
import { electHostId } from './hostElection';

describe('electHostId', () => {
  test('elects the lowest peer id among connected members', () => {
    expect(electHostId(['b', 'a'], ['b', 'a'])).toBe('a');
  });

  test('does not preempt the current membership set when a lower-id peer is connected but not in members yet', () => {
    expect(electHostId(['b', 'a'], ['b'])).toBe('b');
  });

  test('falls back to connected peers when members are unavailable', () => {
    expect(electHostId(['b', 'a'])).toBe('a');
  });

  test('returns null for empty connected peers', () => {
    expect(electHostId([])).toBeNull();
  });
});

