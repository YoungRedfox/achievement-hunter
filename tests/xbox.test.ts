import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unwrap } from '../electron/xbox-unwrap.ts';

const fail = (code: string, message?: string): never => {
  throw Object.assign(new Error(message ?? code), { code });
};

test('unwraps OpenXBL content envelope (object and JSON string)', () => {
  assert.deepEqual(unwrap({ content: { profileUsers: [{ id: '1' }] }, code: 200 }, fail), { profileUsers: [{ id: '1' }] });
  assert.deepEqual(unwrap({ content: '{"titles":[{"titleId":"9"}]}', code: 200 }, fail), { titles: [{ titleId: '9' }] });
  assert.deepEqual(unwrap({ titles: [] }, fail), { titles: [] });
});

test('maps envelope error codes', () => {
  assert.throws(() => unwrap({ content: '["Request contains Accept-Language header with invalid locale value: *"]', code: 400 }, fail), (e: any) => e.code === 'XBOX_ERROR');
  assert.throws(() => unwrap({ content: 'nope', code: 401 }, fail), (e: any) => e.code === 'XBOX_INVALID_KEY');
  assert.throws(() => unwrap({ content: 'slow down', code: 429 }, fail), (e: any) => e.code === 'XBOX_LIMIT');
});
