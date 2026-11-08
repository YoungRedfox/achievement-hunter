import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProfileInput, isSteamKey } from '../electron/profile-input.ts';

test('parses profile urls and ids', () => {
  assert.deepEqual(parseProfileInput('https://steamcommunity.com/profiles/76561197960287930/'), {
    kind: 'steamid',
    value: '76561197960287930',
  });
  assert.deepEqual(parseProfileInput('steamcommunity.com/id/gabelogannewell'), { kind: 'vanity', value: 'gabelogannewell' });
  assert.deepEqual(parseProfileInput('  76561197960287930 '), { kind: 'steamid', value: '76561197960287930' });
  assert.deepEqual(parseProfileInput('https://steamcommunity.com/id/some_name?l=polish'), { kind: 'vanity', value: 'some_name' });
  assert.deepEqual(parseProfileInput('robinwalker'), { kind: 'vanity', value: 'robinwalker' });
});

test('rejects foreign or broken input', () => {
  assert.equal(parseProfileInput(''), null);
  assert.equal(parseProfileInput('https://evil.com/id/test'), null);
  assert.equal(parseProfileInput('https://steamcommunity.com/groups/x'), null);
  assert.equal(parseProfileInput('ma spacje'), null);
});

test('validates steam key format', () => {
  assert.equal(isSteamKey('0123456789ABCDEF0123456789abcdef'), true);
  assert.equal(isSteamKey('xyz'), false);
});
