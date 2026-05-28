---
title: "FAQ"
description: "Short answers to common early Vivi2D questions."
locale: "en"
slug: "faq"
status: "draft"
audience: ["artist","rigger","streamer","developer"]
---
# FAQ

Use these answers when you need quick orientation before reading a full workflow page.

## Is Vivi2D ready for public production work?

The project is still preparing for public release. Treat current builds and documentation as draft unless a release note says otherwise. Use copies of artwork and keep backups.

## Which language should I use?

The default public UI is English. Japanese, Simplified Chinese, and Korean are available for user-facing UI and documentation. Some wording may still improve as native-speaker feedback arrives.

## Should I start with Manual Image Split or Auto Setup?

If your artwork is flat, start with Manual Image Split. If the artwork already has clear named layers, inspect those layers and then try Auto Setup.

## What does Manual Image Split save?

It saves accepted split regions and reviewed layer information. Preview-only helper information should not be treated as final project data unless the workflow explicitly asks you to accept it.

## What does Auto Setup save?

Auto Setup saves reviewed project operations such as bones, static weights, physics groups, cleanup summaries, and scalar settings. Temporary preview calculations and diagnostic details are discarded.

## Why does Auto Setup ask for review?

The app can suggest a starting setup, but it cannot know your artistic intent perfectly. Review protects important regions such as the face, eyes, mouth, and carefully drawn hair or accessories.

## Can I use optional local tools with Vivi2D?

Some optional local-tool guides are available as drafts. Treat these tools as optional, local, and review-gated. Start from the Optional Integrations section on the [User Guide](index.md), and do not use random bridge scripts from unofficial mirrors.

## Can external tools control Viewer?

Yes, through the local Viewer API flow. Use pairing, review scopes, and close or revoke sessions when testing is done.

## Where are screenshots and videos?

The current pages are written to work without media. Screenshots and videos will be added in a later media pass and should match the same workflows described in text.

## What should I include in a bug report?

Include the visible action, the page or panel name, the app version or build source, and whether a small known-good test file works. Do not include private artwork, full local paths, tokens, or client names.

## Where should I go next?

Start with [Open Your First Project](getting-started/open-your-first-project.md), then follow [From Artwork To Starting Rig](workflows/psd-to-rig.md).
