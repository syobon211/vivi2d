---
title: "Language And Text Display"
description: "Fix mixed language, missing glyph, and clipped text issues."
locale: "en"
slug: "troubleshooting/localization"
status: "draft"
audience: ["artist","rigger","streamer","developer"]
---
# Language And Text Display

Use this page when labels, menus, dialogs, or docs do not match your selected language.

## Supported Languages

The current user-facing language set is:

- English
- Japanese
- Simplified Chinese
- Korean

The default public UI is English. Some draft pages or newly added UI may be improved over time, but common workflows should not contain unreadable text.

## Common Symptoms

- A menu is still English after selecting another language.
- A label is clipped or overflows its button.
- Text appears as boxes or missing glyphs.
- A page contains unreadable mojibake-like characters.
- The app and docs use different languages.

## Quick Recovery

1. Open Settings.
2. Confirm the selected language.
3. Switch to another language.
4. Switch back to the language you want.
5. Reopen the dialog or page that looked wrong.
6. Restart Vivi2D if the app does not refresh.

## What To Check Before Reporting

Record:

- Selected language.
- Page, dialog, or panel name.
- The visible label that looks wrong.
- Whether the issue is untranslated text, clipped text, missing glyphs, or unreadable characters.
- Window size and display scale if layout is the issue.

Use a synthetic screenshot or crop if you need to show layout. Hide private artwork and client names.

## Browser Docs Checks

If the website docs look wrong:

- Confirm the URL locale segment, such as `/en/latest/`, `/ja/latest/`, `/zh-Hans/latest/`, or `/ko-KR/latest/`.
- Use the language selector rather than editing the URL by hand.
- Reload the page after switching language.
- Report the page title and the exact visible heading that looks wrong.

## Check Your Result

The selected language should apply to menus, dialogs, workflow panels, common action labels, and user documentation navigation.

## If Something Still Looks Wrong

- If only one label is untranslated, report that visible label.
- If many labels are wrong, include the selected locale and app version.
- If text is clipped, include the dialog name and window size.
- If characters are unreadable, copy a small visible sample rather than a full log.

## Next

[Settings](../reference/settings.md)
