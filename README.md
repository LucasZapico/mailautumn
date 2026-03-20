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
- Pin threads to top
- After-action navigation — go to next email or back to inbox (configurable)

**Smart email classification**
- Automatic categorization: Conversations, Newsletters, Updates, Receipts, Promos
- Conservative heuristic classifier (defaults to conversation, only classifies when signals are strong)
- Instagram-style newsletter feed with sender filter chips
- Structured notification cards with service badges and action summaries
- Structured receipt cards with amounts, order numbers, tracking, and line items extracted from email body
- Manual override — reclassify any thread with one click + undo toast
- Bulk reclassify — "Move all from @domain" reclassifies every thread from a domain at once
- Sender rules — learned automatically when you reclassify (per-sender and per-domain)
- Domain auto-promotion — after 2+ senders from the same domain get the same type, a domain rule is created
- Mark all as read per category
- Unsubscribe button for newsletters (opens List-Unsubscribe URL)
- View and manage learned rules in Settings > Troubleshooting

**AI-powered**
- Thread summaries and sentiment analysis
- Draft replies and new emails with AI (tone selection, custom instructions)
- Rewrite mode — type a draft, then ask AI to polish it
- AI gets full thread context + your current draft
- Multi-provider: OpenAI, Anthropic, Ollama, Open WebUI

**CRM plugin**
- Lightweight contact management built as the first internal plugin
- Opt-in contacts organized by tags (per-business/project)
- Auto-extracts name, title, company, phone, website, LinkedIn from email signatures
- Editable fields, tags, notes, interaction history
- Collapsible contact panel alongside message view
- Toggle on/off in settings

**Search**
- Unified fuzzy search across threads, contacts, and email content (Cmd/Ctrl+K)
- FTS5 full-text search powered by mailsync's search index
- Command palette with working navigation, compose, and AI commands
- Results grouped by type (Contacts, Threads, Commands)

**Multi-account**
- Gmail and Outlook (O365) via OAuth
- IMAP/SMTP for any provider
- Per-account activity bar with unread counts
- Alias detection and send-as support
- From picker filtered by active account (shows all accounts in aggregated inbox)

**Compose**
- Rich text editor (TipTap v2) with formatting toolbar
- Markdown support (bold, italic, code, links, lists, quotes)
- Undo send with configurable delay (5-30 seconds)
- AI draft generation with thread context
- Per-address email signatures (HTML, with templates)
- Contact autocomplete

**Theming**
- 4 theme modes (light, dark, system, auto)
- 6 accent colors with 5 saturation levels
- 3 density modes (compact, default, relaxed)
- Smart contrast text (luminance-based)
- Configurable animation speed (off, fast, default, slow)
- View transitions between categories and threads

**Other**
- Right-click context menus with spellcheck and link handling
- Inline attachment previews (images, PDFs)
- Toast notifications with undo actions
- Keyboard shortcuts
- Plugin architecture (slot-based, internal)
- Single instance lock
- Sync retry with exponential backoff
- Troubleshooting panel with log access and rule management

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

- [ ] AI-first email classification (classify every thread via LLM, cache results)
- [ ] Newsletter dark mode rendering (render as-is works, dark adaptation needs CSS parser)
- [ ] Search within a conversation thread
- [ ] Block sender by email or domain
- [ ] Signature editor with WYSIWYG (currently raw HTML textarea)
- [ ] Focus/Zen modes with desaturation
- [ ] The Screener (triage unknown senders)
- [ ] Calendar integration
- [ ] Snooze
- [ ] Thread pagination / infinite scroll (currently loads 500)
- [ ] Plugin API for external plugins
- [ ] macOS and Windows builds
- [ ] Desktop notification system
- [ ] Contacts sidebar view (browse CRM tags)
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
