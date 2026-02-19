# TreeSheets Copilot

An AI chat interface for your [TreeSheets](http://strlen.com/treesheets/) files. Open any `.cts` file and have a conversation with its contents using your preferred AI provider.

![Platform](https://img.shields.io/badge/platform-macOS-lightgrey) ![Status](https://img.shields.io/badge/status-early%20access-orange) ![License](https://img.shields.io/badge/license-MIT-blue)

## What It Does

TreeSheets is a powerful "hierarchy of spreadsheets" tool. TreeSheets Copilot parses your `.cts` files and lets you chat with their content using AI — ask questions, summarize, extract structure, whatever you need.

## ⚠️ Platform Support

**macOS only for now.** A pre-built `.dmg` is available in [Releases](../../releases). Windows and Linux builds are not yet configured — contributions welcome (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Tech Stack

- **Electron** (Chromium + Node.js desktop shell)
- **React 19 + TypeScript** (frontend)
- **Vite** (dev server + bundler)
- **Electron Forge** (packaging → `.app` / `.dmg`)
- **Playwright** (E2E tests)
- **AI providers supported:** Google Gemini, OpenAI, DeepSeek, Anthropic, and any OpenAI-compatible endpoint

## Getting Started (Development)

### Prerequisites
- Node.js 18+
- npm

### Install & Run
```bash
git clone https://github.com/YOUR_USERNAME/treesheets-copilot.git
cd treesheets-copilot
npm install
npm run dev
```

### Build & Package (macOS)
```bash
npm run make
```

Output will be in `out/`. The `.dmg` is in `out/make/`.

### Run Tests
```bash
npm run test
```

## API Keys

API keys are entered directly in the app UI and stored securely on your machine at `~/Library/Application Support/treesheets-copilot/config.json`. They are never sent anywhere except the AI provider you choose, and are never committed to this repository.

You'll need an API key from one of:
- [Google AI Studio](https://aistudio.google.com/) (Gemini)
- [OpenAI](https://platform.openai.com/)
- [DeepSeek](https://platform.deepseek.com/)
- [Anthropic](https://console.anthropic.com/)

## Project Structure

```
electron/          # Main process (Node.js backend)
  handlers/        # IPC handlers: AI, file parsing, workspace, watcher
src/               # Renderer process (React frontend)
e2e/               # Playwright end-to-end tests
```

## Roadmap / Known Gaps

- [ ] Windows build support
- [ ] Linux build support
- [ ] Installer code signing (macOS notarization)
- [ ] Multi-file workspace chat
- [ ] Streaming responses

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs are very welcome.

## License

MIT — see [LICENSE](LICENSE).
