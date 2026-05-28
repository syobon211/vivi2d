# Development Setup

## Requirements

- Node.js 22
- npm 10+
- Playwright browsers for browser and Electron checks
- Rust toolchain for native runtime work

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
