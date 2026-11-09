import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { rasterizeIcon } from '../src/build/icons.ts';

function pixels(png: Buffer): Buffer {
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return inflateSync(Buffer.concat(chunks));
}

test('build creates black icons with a white outline and transparent background', () => {
  for (const size of [16, 32, 48, 128]) {
    const rgba = pixels(
      readFileSync(new URL(`../dist/icons/icon-${size}.png`, import.meta.url)),
    );
    const shades = new Set<number>();
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const index = y * (1 + size * 4) + 1 + x * 4;
        if (rgba[index + 3]) shades.add(rgba[index]);
      }
    assert.equal(rgba[4], 0);
    assert.ok(shades.has(0));
    assert.ok(shades.has(255));
  }
});

test('PNG geometry comes from the SVG rather than duplicated build coordinates', () => {
  const source = readFileSync(
    new URL('../src/icon.svg', import.meta.url),
    'utf8',
  );
  const changed = source.replace('x1="32"', 'x1="20"');
  assert.notDeepEqual(rasterizeIcon(source, 32), rasterizeIcon(changed, 32));
});
