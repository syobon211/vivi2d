# Development Setup

## Requirements

- Node.js 22 for local development and CI project commands
- npm 10+ for local development
- Playwright browsers for browser and Electron checks
- Rust toolchain for native runtime work

GitHub Actions are pinned to Node 24-compatible action releases. Vivi2D project
commands still run on Node.js 22, with release publication workflows pinning
Node.js 22.14.0 and npm 11.5.1 or newer where npm provenance is required.

## Install

```bash
npm ci
npx playwright install chromium firefox webkit
```

## Run The Editor

```bash
npm run dev
```

Run the packaged entry after build or Electron-related changes:

```bash
npm run start
```

## Build

```bash
npm run build
npm run build:packages
```

## Common Local Checks

```bash
npm run test
npm run check:packages-types
npm run check:quality
```

Use focused package or E2E commands while iterating, then run the relevant
quality gate before sending a release-facing PR.
