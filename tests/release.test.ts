import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseMetadata } from '../src/build/release.ts';
import type { Versions } from '../src/build/release.ts';

const versions: Versions = {
  package: '1.2.3',
  lockfile: '1.2.3',
  lockfilePackage: '1.2.3',
  distribution: '1.2.3',
};
const sha = 'abcdef0123456789abcdef0123456789abcdef01';

test('main artifacts identify their exact source commit without changing the version', () => {
  assert.deepEqual(releaseMetadata('refs/heads/main', sha, versions), {
    artifactName: 'multi-cursor-chrome-dev-abcdef012345',
    archiveName: 'multi-cursor-chrome-dev-abcdef012345.zip',
    version: '1.2.3',
  });
});
test('version tags produce stable named release archives', () => {
  assert.equal(
    releaseMetadata('refs/tags/v1.2.3', sha, versions).archiveName,
    'multi-cursor-chrome-v1.2.3.crx',
  );
});
test('mismatched tag or version files prevent release packaging', () => {
  assert.throws(
    () => releaseMetadata('refs/tags/v1.2.4', sha, versions),
    /Release tag must be v1.2.3/,
  );
  for (const source of [
    'lockfile',
    'lockfilePackage',
    'distribution',
  ] as const) {
    assert.throws(
      () =>
        releaseMetadata('refs/tags/v1.2.3', sha, {
          ...versions,
          [source]: '1.2.2',
        }),
      /does not match/,
    );
  }
});
test('malformed versions, tags, refs, and commit identifiers are rejected', () => {
  assert.throws(
    () => releaseMetadata('refs/tags/v1.2.3-rc.1', sha, versions),
    /Release tag/,
  );
  assert.throws(
    () => releaseMetadata('refs/heads/feature', sha, versions),
    /only produced for main/,
  );
  assert.throws(
    () => releaseMetadata('refs/heads/main', 'not-a-sha', versions),
    /full Git commit SHA/,
  );
  assert.throws(
    () =>
      releaseMetadata('refs/heads/main', sha, {
        ...versions,
        package: '1.2.3\nunsafe',
      }),
    /numeric/,
  );
});
