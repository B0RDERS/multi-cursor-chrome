import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { Script } from 'node:vm';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL('../src/manifest.json', import.meta.url), 'utf8'),
);
test('distribution contains only extension runtime files', () => {
  const files = readdirSync(dist, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(fileURLToPath(dist), join(entry.parentPath, entry.name)),
    )
    .sort();
  assert.deepEqual(
    files,
    [
      'LICENSE',
      'background.js',
      'content.js',
      ...Object.values(manifest.icons),
      'manifest.json',
      'home.css',
      'home.html',
      'home.js',
    ].sort(),
  );
});
test('bundled scripts parse as standalone browser scripts', () => {
  for (const name of ['content.js', 'home.js', 'background.js']) {
    assert.doesNotThrow(
      () =>
        new Script(readFileSync(new URL(name, dist), 'utf8'), {
          filename: name,
        }),
    );
  }
});
test('every Home page asset is packaged', () => {
  const html = readFileSync(new URL('home.html', dist), 'utf8');
  for (const [, file] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(existsSync(new URL(file, dist)), file);
  }
});
test('packaged icons have the expected PNG dimensions', () => {
  for (const [size, path] of Object.entries<string>(manifest.icons)) {
    const png = readFileSync(new URL(path, dist));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), Number(size));
    assert.equal(png.readUInt32BE(20), Number(size));
  }
});
test('Home includes a working playground and only extension-specific settings', () => {
  const html = readFileSync(new URL('home.html', dist), 'utf8');
  assert.match(html, /<title>Multi-Cursor Textareas — Home<\/title>/);
  assert.match(html, /<textarea[^>]+id="playground"[^>]*><\/textarea>/);
  assert.match(html, /<script src="home.js"><\/script>/);
  const bundle = readFileSync(new URL('home.js', dist), 'utf8');
  assert.match(bundle, /__textareaMultiCursorLoaded/);
});

test('minified HTML preserves the playground text and whitespace', () => {
  const source = readFileSync(
    new URL('../src/home/home.html', import.meta.url),
    'utf8',
  );
  const output = readFileSync(new URL('home.html', dist), 'utf8');
  const textarea = /<textarea\b[^>]*>([\s\S]*?)<\/textarea>/;
  assert.equal(output.match(textarea)?.[1], source.match(textarea)?.[1]);
  assert.ok(output.length < source.length);
});

test('build minifies CSS and the manifest and adds package metadata to the manifest', () => {
  for (const file of ['home.css', 'manifest.json']) {
    const output = readFileSync(new URL(file, dist), 'utf8');
    assert.equal(output.trim().includes('\n'), false, file);
  }
  const source = readFileSync(
    new URL('../src/manifest.json', import.meta.url),
    'utf8',
  );
  const output = readFileSync(new URL('manifest.json', dist), 'utf8');
  const { version, description } = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(JSON.parse(output), { ...manifest, version, description });
  assert.ok(output.length < source.length);
});

test('distributed extension retains the project license notice', () => {
  const source = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
  assert.equal(readFileSync(new URL('LICENSE', dist), 'utf8'), source);
});
