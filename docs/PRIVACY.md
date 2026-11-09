# Privacy policy

Effective November 5, 2026

Multi-Cursor Textareas processes edits locally. It does not send textarea text, clipboard data, settings, or browsing activity to the developer or external services. It has no analytics, ads, or telemetry.

## Text and clipboard

The extension reads textarea text and selections to place cursors and apply edits. Temporary layout data and snapshots of text and selections stay in page memory and may remain until the page closes. The extension does not save them to its storage.

The extension uses clipboard data from copy, cut, and paste events while handling those actions. Websites can still read and submit their own forms and respond to editing events.

## Settings

Shortcuts, font, and wrapping preferences are saved in local extension storage in your Chrome profile. They are not synced through Chrome Sync. To reset them, choose **Restore defaults**, then **Save changes** on Home. Uninstalling the extension removes its local storage.

## Permissions

| Access                       | Purpose                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `<all_urls>` content scripts | Enable editing in textareas on permitted sites and frames. |
| `storage`                    | Save settings and apply changes to open pages.             |

You can limit site access in Chrome’s extension settings.

For privacy questions, open a GitHub issue using sample data. Report vulnerabilities privately through the [security policy](SECURITY.md).
