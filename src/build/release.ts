import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Versions {
  package: string;
  lockfile: string;
  lockfilePackage: string;
  distribution: string;
}

export interface ReleaseMetadata {
  artifactName: string;
  archiveName: string;
  version: string;
}

export function releaseMetadata(
  ref: string,
  sha: string,
  versions: Versions,
): ReleaseMetadata {
  const version = versions.package;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Use a numeric MAJOR.MINOR.PATCH package version.');
  }
  for (const [source, value] of Object.entries(versions)) {
    if (value !== version)
      throw new Error(
        `${source} version ${value} does not match package version ${version}.`,
      );
  }

  let label: string;
  if (ref === 'refs/heads/main') {
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(sha))
      throw new Error(
        'A full Git commit SHA is required for development artifacts.',
      );
    label = `dev-${sha.slice(0, 12).toLowerCase()}`;
  } else if (ref.startsWith('refs/tags/')) {
    const tag = ref.slice('refs/tags/'.length);
    if (tag !== `v${version}`)
      throw new Error(`Release tag must be v${version}; received ${tag}.`);
    label = tag;
  } else {
    throw new Error('Artifacts are only produced for main or version tags.');
  }
  const artifactName = `multi-cursor-chrome-${label}`;
  return {
    artifactName,
    archiveName: `${artifactName}.${ref === 'refs/heads/main' ? 'zip' : 'crz'}`,
    version,
  };
}

async function main(): Promise<void> {
  const root = new URL('../../', import.meta.url);
  const json = async (path: string) =>
    JSON.parse(await readFile(new URL(path, root), 'utf8'));
  const [pkg, lock, distribution] = await Promise.all([
    json('package.json'),
    json('package-lock.json'),
    json('dist/manifest.json'),
  ]);
  const ref = process.argv[2]
    ? `refs/tags/${process.argv[2]}`
    : process.env.GITHUB_REF || '';
  const metadata = releaseMetadata(ref, process.env.GITHUB_SHA || '', {
    package: pkg.version,
    lockfile: lock.version,
    lockfilePackage: lock.packages?.['']?.version,
    distribution: distribution.version,
  });
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `artifact-name=${metadata.artifactName}\narchive-name=${metadata.archiveName}\n`,
    );
  }
  console.log(JSON.stringify(metadata, null, 2));
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await main();
}
