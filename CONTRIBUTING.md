# Contributing to TreeSheets Copilot

Thanks for your interest in contributing! This project is in early stages and community help is very welcome.

## Getting Started

1. Fork the repo and clone your fork
2. Run `npm install`
3. Run `npm run dev` to start the Electron app in development mode
4. API keys are entered through the app UI — no .env setup required for basic development

## Areas Where Help Is Especially Welcome

- **Windows and Linux builds** — currently only macOS is supported. Electron Forge config for other platforms is a great first contribution.
- **Parser improvements** — the CTS binary parser is in `electron/handlers/parser.ts`
- **UI/UX** — the frontend is plain React + CSS, no component library
- **Tests** — Playwright E2E tests live in `e2e/main.spec.ts`

## Submitting a PR

- Open an issue first for significant changes
- Keep PRs focused — one concern per PR
- Make sure existing Playwright tests pass: `npm run test`

## Code Style

TypeScript throughout. No Tailwind — plain CSS in `src/App.css`. Electron main process in `electron/`, React renderer in `src/`.
