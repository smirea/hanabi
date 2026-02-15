import { describe, expect, test } from 'bun:test';
import { getNetworkDomainScope, getScopedNetworkAppId } from './networkConstants';

describe('network domain scope', () => {
  test('normalizes hostname casing and whitespace', () => {
    expect(getNetworkDomainScope('  LOCALHOST  ')).toBe('localhost');
  });

  test('separates app ids per hostname', () => {
    const localAppId = getScopedNetworkAppId('localhost');
    const prodAppId = getScopedNetworkAppId('hanabi.example.com');
    expect(localAppId).not.toBe(prodAppId);
  });

  test('rejects empty hostnames', () => {
    expect(() => getNetworkDomainScope('   ')).toThrow('Network domain scope must not be empty');
  });
});
