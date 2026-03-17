# Mailautumn

We hate email. Not the concept — the experience. Every client feels like it was designed for 2005 and then duct-taped into the modern era. We used Spark on macOS and loved it, but after switching to Linux the options were... limited. Mailspring was the closest thing to good, but it was far from the email experience we actually wanted.

It's been on our hit list for a long time to try and build something better. With the improvements in AI tooling, we decided to take a shot and see how far we could get. This is the result.

Mailautumn is a ground-up rewrite of [Mailspring's](https://github.com/Foundry376/Mailspring) frontend. The battle-tested `mailsync` C++ engine handles all the hard stuff (IMAP/SMTP sync, threading, search indexing). We just built the UI we always wanted on top of it.

We're happy with where it is. It's an improved experience — at least for our workflow and needs. Use it, fork it, enjoy it. We're happy to get feedback, and pardon any terrible code. This is a side project, so we'll respond and improve when we have bandwidth.

A huge thank you to the Mailspring team for doing all the heavy lifting.

## Features

**Conversations, not message lists**
- Slack-style threaded conversations with content extraction (strips quoted text, signatures, attribution lines)
- Inline replies at the bottom of the thread
- Prev/next thread navigation

**Smart email classification**
- Automatic categorization: Conversations, Newsletters, Updates, Receipts, Promos
- Heuristic classifier with AI fallback for edge cases
- Instagram-style newsletter feed, structured notification and receipt cards
- Manual override — reclassify any thread with one click

**AI-powered**
- Thread summaries and sentiment analysis
- Draft replies and new emails with AI (tone selection, custom instructions)
- Rewrite mode — type a draft, then ask AI to polish it
- Multi-provider: OpenAI, Anthropic, Ollama, Open WebUI

**CRM plugin**
- Lightweight contact management built as a plugin
- Opt-in contacts organized by bucket (per-business/project)
- Auto-extracts name, title, company, phone, website, LinkedIn from email signatures
- Editable fields, tags, notes, interaction history
- Toggle on/off in settings

**Search**
- Unified fuzzy search across 70K+ threads, contacts, and email content (Cmd/Ctrl+K)
- FTS5 full-text search powered by mailsync's search index
- Command palette with working navigation, compose, and AI commands

**Multi-account**
- Gmail and Outlook (O365) via OAuth
- IMAP/SMTP for any provider
- Per-account activity bar with unread counts
- Alias detection and send-as support

**Compose**
- Rich text editor with formatting toolbar
- Markdown support (bold, italic, code, links, lists, quotes)
- Undo send with configurable delay (5-30 seconds)
- AI draft generation with thread context

**Theming**
- 4 theme modes (light, dark, system, auto)
- 6 accent colors with 5 saturation levels
- 3 density modes (compact, default, relaxed)
- Smart contrast text (luminance-based)

**Other**
- Right-click context menus with spellcheck
- Inline attachment previews (images, PDFs)
- Keyboard shortcuts
- Plugin architecture (slot-based, internal)

## Stack

Electron + Vite + React 18 + TypeScript + Tailwind CSS v4 + Jotai

## Getting started

### Prerequisites

- Node.js 20+
- The `mailsync` binary from [Mailspring](https://github.com/Foundry376/Mailspring)

### Getting mailsync

This project depends on the `mailsync` C++ binary from upstream Mailspring. Either:

1. **Extract from a Mailspring release** — download a [Mailspring release](https://github.com/Foundry376/Mailspring/releases), grab `mailsync.bin` and the `lib*.so` files from the app bundle
2. **Build from source** — clone [Foundry376/Mailspring](https://github.com/Foundry376/Mailspring) and build the mailsync target

Place the binary and shared libraries in `resources/mailsync/`, or set the `MAILSYNC_DIR` environment variable.

### Install

```bash
npm install
```

### Environment variables (optional)

OAuth credentials are bundled from upstream Mailspring by default. Override with your own if needed:

```bash
# Override OAuth credentials (optional — defaults work out of the box)
MS_GMAIL_CLIENT_ID=your-google-oauth-client-id
MS_GMAIL_CLIENT_SECRET=your-google-oauth-client-secret
MS_O365_CLIENT_ID=your-microsoft-oauth-client-id

# Custom mailsync path (optional — defaults to resources/mailsync/)
MAILSYNC_DIR=/path/to/mailsync
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build              # Vite bundles only
npm run dist:linux         # AppImage + .deb
```

### Type checking

```bash
npm run typecheck
```

## Roadmap / Wishlist

Things we'd like to get to when bandwidth allows. No promises, no timelines.

- [ ] Newsletter dark mode rendering (inline rendering works, styling needs refinement)
- [ ] Smarter email classifier (reduce cross-feed duplicates, possibly fine-tuned model)
- [ ] Search within a conversation thread
- [ ] Command palette improvements (contact actions, more commands)
- [ ] Focus/Zen modes with desaturation
- [ ] The Screener (triage unknown senders)
- [ ] Calendar integration
- [ ] Snooze
- [ ] Plugin API for external plugins
- [ ] macOS and Windows builds
- [ ] Notification system
- [ ] Contacts sidebar view (browse CRM buckets)
- [ ] Thread-level CRM tags in thread list
- [ ] Import/export CRM data

## Architecture

```
Electron Main Process
├── mailsync.bin (C++)  ←→  SQLite (edgehill.db)
│   └── JSON over stdio      └── read-only from Electron
├── accounts.ts              — credential storage (safeStorage)
├── oauth.ts                 — Gmail/O365 OAuth flow
├── ai-api.ts                — shared AI calling layer
├── crm-db.ts                — CRM tables in shared DB
└── ipc-handlers.ts          — bridges main ↔ renderer

Renderer (React + Jotai)
├── App.tsx                  — routing, delta listener
├── atoms/app.ts             — all state + actions
├── components/              — UI components
├── plugins/                 — plugin registry + CRM plugin
│   └── crm/                 — contact panel, signature parser
└── lib/                     — content extractor, classifier, theme
```

## License

GPL-3.0 — same as [Mailspring](https://github.com/Foundry376/Mailspring). See [LICENSE](LICENSE).
