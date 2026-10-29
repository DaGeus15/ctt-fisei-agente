import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitMessage } from '../src/channels/common.js';

test('splitMessage respeta el límite y no pierde texto', () => {
  const text = Array.from({ length: 50 }, (_, i) => `Línea número ${i} con algo de contenido`).join('\n');
  const parts = splitMessage(text, 200);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 200));
  assert.equal(parts.join('\n'), text);
  assert.deepEqual(splitMessage('corto', 200), ['corto']);
});
