import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { minify } from 'html-minifier';
import { rasterizeIcon } from './icons.ts';

const root = new URL('../../', import.meta.url);
const dist = new URL('dist/', root);
const sourceRoot = new URL('src/', root);
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', sourceRoot), 'utf8'),
);
const { version, description } = JSON.parse(
  await readFile(new URL('package.json', root), 'utf8'),
);
await rm(dist, { recursive: true, force: true });
const svg = await readFile(new URL('src/icon.svg', root), 'utf8');
for (const [size, path] of Object.entries<string>(manifest.icons)) {
  const icon = new URL(path, dist);
  await mkdir(new URL('./', icon), { recursive: true });
  await writeFile(icon, rasterizeIcon(svg, Number(size)));
}
await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: [
    { in: 'src/editor/content.ts', out: 'content' },
    { in: 'src/home/home.ts', out: 'home' },
    { in: 'src/home/home.css', out: 'home' },
    { in: 'src/background/background.ts', out: 'background' },
  ],
  outdir: fileURLToPath(dist),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: `chrome${manifest.minimum_chrome_version}`,
  sourcemap: false,
  legalComments: 'none',
  minify: true,
});
const pages = {
  'home.html': 'home/home.html',
};
for (const [file, path] of Object.entries(pages)) {
  const source = await readFile(new URL(path, sourceRoot), 'utf8');
  const html = await minify(source, {
    collapseWhitespace: true,
    removeComments: true,
    ignoreCustomFragments: [/<textarea\b[^>]*>[\s\S]*?<\/textarea>/i],
  });
  await writeFile(new URL(file, dist), html);
}
await writeFile(
  new URL('manifest.json', dist),
  JSON.stringify({ ...manifest, version, description }),
);
await copyFile(new URL('LICENSE', root), new URL('LICENSE', dist));
console.log('Built minified extension in dist/');
