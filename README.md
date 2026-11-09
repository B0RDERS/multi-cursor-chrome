# Multi-Cursor Textareas

A Chrome extension for editing standard HTML textareas with multiple cursors. Requires Chrome 120 or later.

See the [changelog](docs/CHANGELOG.md) for changes by version.

## Install

Download the `.crz` archive and its `.sig` file from [Releases](https://github.com/B0RDERS/multi-cursor-chrome/releases).

### Verify the download

Use the release public key to verify the archive signature before extracting or uploading it.

```sh
openssl dgst -sha256 -verify release-public.pem -signature multi-cursor-chrome-v0.0.1.crz.sig multi-cursor-chrome-v0.0.1.crz
```

Extract the verified archive with a ZIP tool.

Open `chrome://extensions`, turn on **Developer mode**, and choose **Load unpacked**. Select the extracted folder containing `manifest.json`. For local HTML files, turn on **Allow access to file URLs** in the extension’s details.

## Use

Click the toolbar icon to open **Home** for settings and a practice textarea. You can assign a shortcut to open Home at `chrome://extensions/shortcuts`.

| Action                         | macOS                    | Windows and Linux |
| ------------------------------ | ------------------------ | ----------------- |
| Add a cursor below / above     | Option+Command+Down / Up | Alt+Down / Up     |
| Toggle a cursor at the pointer | Option+click             | Alt+click         |

- Reverse direction to remove the last added cursors, even after typing.
- Hold Shift with an add-cursor shortcut to extend selections. Press Escape to return to one cursor.
- Copy joins selections with newlines. Paste distributes one line per cursor when the counts match, or pastes the full text at each cursor.
- Duplicate cursors and overlapping selections merge.

On Home, click a shortcut to reassign it or choose **Disable** to clear it. Keyboard toggles use the pointer location. If a shortcut conflicts with Chrome or the operating system, choose another and try it in the practice textarea.

**Monospace font** and **Disable line wrapping** are off by default. Choose **Save changes** to apply settings to open pages. To reset them, choose **Restore defaults**, then **Save changes**.

## Limitations

The extension supports standard textareas on permitted pages and frames. Rich-text editors, contenteditable elements, and textareas inside shadow roots are unsupported. IME input across multiple cursors is outside supported behavior. Bidirectional text, CSS transforms, and website keyboard shortcuts can affect editing.

Adding cursors follows newline-separated lines. Arrow-key movement follows the browser’s visual lines, including wrapping. Clicking, native movement, or undo and redo reset the cursor-addition sequence.

## Development

With Node.js 24 or later, run:

```sh
npm ci
npm run check
```

Load `dist/` as an unpacked extension. After rebuilding with `npm run build`, reload the extension and refresh the test page.

See the [release guide](docs/CONTRIBUTING.md#release).

[Contributing](docs/CONTRIBUTING.md) · [Privacy](docs/PRIVACY.md) · [Security](docs/SECURITY.md) · [MIT license](LICENSE)
