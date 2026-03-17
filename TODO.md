# QA Checklist

## Add Another Account
- [ ] Open Settings → click "Add Account" (or use activity bar add button)
- [ ] Complete Gmail/Outlook OAuth flow in browser
- [ ] Verify account appears in activity bar with profile picture (not just provider letter)
- [ ] Verify account filter bar appears in thread list (only shows with 2+ accounts)
- [ ] Click account icon in activity bar — threads filter to that account only
- [ ] Click "All Inboxes" icon — threads from all accounts shown
- [ ] Verify new account's threads appear and sync properly
- [ ] Archive/trash/star actions work on new account's threads
- [ ] Remove the account — verify it disappears from activity bar and threads clear

## Account Avatars
- [ ] Existing accounts without avatars get profile pictures after app restart
- [ ] New accounts get profile pictures immediately after OAuth
- [ ] Activity bar shows Google profile image (not just "G" letter)
- [ ] Fallback to provider letter if no profile picture available

---

# Known Bugs (mailsync C++ backend)

## Duplicate Message Storage
**Severity:** Medium — causes duplicate messages in conversation view
**Workaround:** Dedup in `getMessages()` by `headerMessageId` + fallback composite key
**Location:** `src/main/database.ts` — `getMessages()`

mailsync occasionally writes the same email twice into the Message table with different internal IDs. One copy gets the real RFC `Message-ID` header (`headerMessageId`), the other gets a synthetic `@unknownmsgid` value. Both copies have identical sender, timestamp, body, and thread assignment.

**Evidence (2026-03-14):**
- 15 duplicate message groups found across all accounts
- Same account, same thread, same timestamp, same body content
- One copy has real `headerMessageId`, the other has `@unknownmsgid`
- Likely cause: mailsync processes the message before the Message-ID header is resolved during IMAP sync, then processes it again after

**Example:**
```
ID: VjzK...  hMsgId: -4156737534804754183@unknownmsgid  date: 1773536051  body: "test 1"
ID: EAjN...  hMsgId: 69b60334...@mx.google.com           date: 1773536051  body: "test 1"
```

**If rewriting backend (Rust/Zig):** The sync engine should deduplicate by `Message-ID` header before inserting into the database. If a message arrives without a `Message-ID` (rare but possible), assign a deterministic ID based on `date + sender + subject + body hash` rather than a random negative number. The database should have a UNIQUE constraint on `(accountId, headerMessageId)` to prevent this class of bug entirely.

---

# Future Features

## Snooze
- Snooze threads to reappear at a chosen time (later today, tomorrow, next week, custom)
- Needs local-only implementation — mailsync has no native snooze task
- Store snooze time in local SQLite table, use Electron scheduled timer to resurface
- UI: snooze button in thread list quick actions + message view toolbar + context menu

## Pin
- Pin important threads to the top of the thread list
- Local-only (not synced to server)
- Store pinned thread IDs in local storage or SQLite
- Pinned threads sort above unpinned regardless of date
- UI: pin button in thread list quick actions + message view toolbar
