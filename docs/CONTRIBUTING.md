# Contributing

Bug reports, docs fixes, and small improvements are welcome. For bugs, use the GitHub **Bug report** form. Report vulnerabilities privately as described in [Security](SECURITY.md).

## Open a pull request

1. Follow the [development setup](../README.md#development).
2. Keep your change focused and run `npm run check`. If formatting fails, run `npm run format`.
3. In the PR, explain what changed and how you checked it. For behavior fixes, add a regression test where practical. For browser-facing changes, try the relevant [browser checks](#browser-checks).

If your change affects permissions or data handling, update the [privacy policy](PRIVACY.md). Contributions use the [MIT license](../LICENSE). Keep third-party license notices.

## Browser checks

Load `dist/` in `chrome://extensions/`. In the release PR’s **Testing** table, record the OS version, Chrome version, and results. Mark untested platforms **Not Run**.

- [ ] Add, remove, and toggle cursors with default and custom shortcuts. Check duplicate cursors and reversing direction after typing.
- [ ] Edit empty, trailing, and wrapped lines, emoji, and accented text. Check caret placement, navigation, selection, and single-cursor editing.
- [ ] Undo and redo with shortcuts and Chrome’s Edit menu. Check clipboard edits, Delete, Enter, and website input events.
- [ ] Save and reset settings, reopen Home, and refresh a website. Check Home and toolbar icons in light and dark mode.
- [ ] Check focused, new, website-controlled, read-only, and disabled textareas, plus frames, scrolling, and resizing.

## Release

1. Create `release/vMAJOR.MINOR.PATCH` from `main`. For a version bump, run `npm version <version> --no-git-tag-version`.
2. Update the [changelog](CHANGELOG.md) with user-facing changes only. Update the verification command in the README and review the [privacy policy](PRIVACY.md).
3. Push the release branch. Append `&template=release.md` to the GitHub compare URL ending in `?expand=1`, then open that URL. Complete the testing table and approval checklist, submit the PR against `main`, and request review.
4. Merge after approval and **Check and build** passes. Actions tags the merged commit and publishes the tested extension as a `.crz` ZIP archive with a detached signature (`.crz.sig`) and SHA-256 checksum.
