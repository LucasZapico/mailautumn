# Mailautumn

A modern email client built with Electron, React, and the [Mailspring](https://github.com/Foundry376/Mailspring) sync engine. Designed around conversations, not message lists.

## What is this?

A ground-up rewrite of Mailspring's frontend. The C++ `mailsync` binary handles IMAP/SMTP sync and database writes; Mailautumn provides the UI layer.

**Stack:** Electron + Vite + React 18 + TypeScript + Tailwind CSS v4 + Jotai

**Key features:**
- Slack-style conversation threads
- Email type detection (conversations, newsletters, updates, receipts)
- AI-powered thread summaries and draft generation (OpenAI, Anthropic, Ollama, Open WebUI)
- Theme system with multiple modes, accents, and density levels
- Command palette (Cmd/Ctrl+K)
- Undo send
- Inline attachment previews (images, PDFs)

## Prerequisites

- Node.js 20+
- The `mailsync` binary from [Mailspring](https://github.com/Foundry376/Mailspring) (see below)

### Getting mailsync

This project depends on the `mailsync` C++ binary from upstream Mailspring. You need to either:

1. **Build from source:** Clone [Foundry376/Mailspring](https://github.com/Foundry376/Mailspring) and build the `mailsync` binary
2. **Extract from a Mailspring release:** Download a Mailspring release and copy the `mailsync.bin` and shared libraries from the app bundle

Place the binary and its dependencies in a `mailsync/` directory next to this project, or set the `MAILSYNC_DIR` environment variable.

## Setup

```bash
npm install
```

### Environment variables

Create a `.env` file (or export these in your shell):

```bash
# Required for OAuth sign-in
MS_GMAIL_CLIENT_ID=your-google-oauth-client-id
MS_GMAIL_CLIENT_SECRET=your-google-oauth-client-secret
MS_O365_CLIENT_ID=your-microsoft-oauth-client-id

# Path to mailsync binary directory (optional, defaults to ../mailsync)
MAILSYNC_DIR=/path/to/mailsync
```

To get OAuth credentials:
- **Gmail:** Create a project in [Google Cloud Console](https://console.cloud.google.com/), enable the Gmail API, and create OAuth 2.0 credentials
- **Outlook:** Register an app in [Azure Portal](https://portal.azure.com/)

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Type checking

```bash
npm run typecheck
```

## License

GPL-3.0 — see [LICENSE](LICENSE)
