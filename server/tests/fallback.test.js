import test from 'node:test';
import assert from 'node:assert/strict';
import { callAndParse } from '../ai/utils/jsonParser.js';

test('callAndParse throws when AI call fails and no fallback is provided', async () => {
  let threw = false;
  try {
    await callAndParse([{ role: 'user', content: 'hello' }]);
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('AI call failed'));
  }
  assert.equal(threw, true);
});

test('callAndParse returns explicit fallback when provided', async () => {
  const result = await callAndParse([{ role: 'user', content: 'hello' }], {
    fallback: { ok: true, source: 'fallback' },
  });
  assert.deepEqual(result, { ok: true, source: 'fallback' });
});
