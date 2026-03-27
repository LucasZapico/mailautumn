/**
 * Demo data for screenshot mode.
 * Activated by DEMO_MODE=true in .env.
 */

import type { Account, Thread, Message, Contact, EmailType } from './types';

// ── Helpers ──

let idCounter = 0;
function uid(): string { return `demo-${++idCounter}`; }

function ago(hours: number): Date {
  return new Date(Date.now() - hours * 3600 * 1000);
}

function msg(threadId: string, from: Contact, to: Contact[], subject: string, body: string, hoursAgo: number, opts?: Partial<Message>): Message {
  return {
    id: uid(),
    threadId,
    from,
    to,
    cc: [],
    subject,
    body,
    snippet: body.replace(/<[^>]*>/g, '').slice(0, 120),
    date: ago(hoursAgo),
    unread: false,
    starred: false,
    draft: false,
    ...opts,
  };
}

// ── Contacts ──

const me: Contact = { name: 'Jordan Rivera', email: 'jordan@mailautumn.com' };
const alex: Contact = { name: 'Alex Chen', email: 'alex.chen@acmecorp.com' };
const sam: Contact = { name: 'Sam Patel', email: 'sam@designstudio.io' };
const maya: Contact = { name: 'Maya Johnson', email: 'maya.johnson@techstart.dev' };
const liam: Contact = { name: 'Liam O\'Brien', email: 'liam@devteam.co' };
const priya: Contact = { name: 'Priya Sharma', email: 'priya@cloudstack.io' };
const noor: Contact = { name: 'Noor Haddad', email: 'noor.haddad@openmail.org' };
const chloe: Contact = { name: 'Chloe Martin', email: 'chloe@freelance.design' };
const diego: Contact = { name: 'Diego Reyes', email: 'diego.reyes@startuplab.co' };
const emma: Contact = { name: 'Emma Larsson', email: 'emma@nordicdesign.se' };

// ── Accounts ──

export function createDemoAccounts(): Account[] {
  return [
    { id: 'demo-acct-1', name: 'Jordan Rivera', email: 'jordan@mailautumn.com', provider: 'gmail', color: '#4a9eff', unreadCount: 8 },
    { id: 'demo-acct-2', name: 'Jordan R. (Work)', email: 'jordan.r@acmecorp.com', provider: 'outlook', color: '#e5684a', unreadCount: 3 },
  ];
}

// ── Threads ──

export function createDemoThreads(): Thread[] {
  const acct1 = 'demo-acct-1';
  const acct2 = 'demo-acct-2';
  const threads: Thread[] = [];

  // ── Conversations ──

  const t1 = uid();
  threads.push({
    id: t1, accountId: acct1, subject: 'Re: Q3 product roadmap review', snippet: 'I think we should prioritize the mobile experience first', unread: true, starred: true, pinned: true,
    participants: [me, alex, sam, maya], lastMessageDate: ago(0.5), messageCount: 4, labels: [], type: 'conversation', messages: [
      msg(t1, alex, [me, sam, maya], 'Q3 product roadmap review', '<p>Hey team, sharing the updated roadmap for Q3. Key themes: mobile-first redesign, API v3, and the new onboarding flow.</p><p>Can we schedule a review for Thursday?</p>', 48),
      msg(t1, sam, [me, alex, maya], 'Re: Q3 product roadmap review', '<p>Looks great Alex! I have some thoughts on the onboarding flow — the current 5-step wizard has a 34% drop-off at step 3. I\'d suggest consolidating to 3 steps max.</p>', 36),
      msg(t1, maya, [me, alex, sam], 'Re: Q3 product roadmap review', '<p>Agree with Sam on onboarding. Also — should we factor in the accessibility audit results? We got the report back and there are some quick wins we could bundle in.</p>', 12),
      msg(t1, me, [alex, sam, maya], 'Re: Q3 product roadmap review', '<p>Good points all around. I think we should prioritize the mobile experience first — 62% of our traffic is mobile now. Let\'s sync Thursday at 2pm.</p>', 0.5, { unread: true }),
    ],
  });

  const t2 = uid();
  threads.push({
    id: t2, accountId: acct1, subject: 'Coffee next week?', snippet: 'Would love to catch up — it\'s been too long!', unread: true, starred: false, pinned: false,
    participants: [me, chloe], lastMessageDate: ago(2), messageCount: 2, labels: [], type: 'conversation', messages: [
      msg(t2, chloe, [me], 'Coffee next week?', '<p>Hey Jordan! I\'m going to be in town next Tuesday through Thursday. Would love to catch up — it\'s been too long! Any afternoon work for you?</p>', 5),
      msg(t2, me, [chloe], 'Re: Coffee next week?', '<p>Chloe! Absolutely, I\'d love that. Wednesday afternoon works perfectly — how about 2pm at Elm Street Coffee?</p>', 2, { unread: true }),
    ],
  });

  const t3 = uid();
  threads.push({
    id: t3, accountId: acct2, subject: 'Re: Design system tokens — final review', snippet: 'Pushed the updated tokens to the staging branch', unread: false, starred: true, pinned: false,
    participants: [me, sam, emma], lastMessageDate: ago(6), messageCount: 3, labels: [], type: 'conversation', messages: [
      msg(t3, me, [sam, emma], 'Design system tokens — final review', '<p>Hi both, the design token spec is ready for final review. I\'ve organized everything by primitive → semantic → component layers.</p><p>Main changes: consolidated the spacing scale from 12 to 8 values, added dark mode semantic tokens.</p>', 28),
      msg(t3, emma, [me, sam], 'Re: Design system tokens — final review', '<p>This is really clean, Jordan. Love the semantic layer approach. One note: can we add a `surface-elevated` token for cards and modals? Currently they fall back to `bg-secondary` which doesn\'t look right in dark mode.</p>', 18),
      msg(t3, sam, [me, emma], 'Re: Design system tokens — final review', '<p>Great catch Emma. I added `surface-elevated` and `surface-sunken` tokens. Pushed the updated tokens to the staging branch — take a look when you get a chance.</p>', 6),
    ],
  });

  const t4 = uid();
  threads.push({
    id: t4, accountId: acct1, subject: 'Feedback on portfolio redesign', snippet: 'The typography choices are really strong', unread: true, starred: false, pinned: false,
    participants: [me, diego], lastMessageDate: ago(3), messageCount: 2, labels: [], type: 'conversation', messages: [
      msg(t4, me, [diego], 'Feedback on portfolio redesign', '<p>Hey Diego, finally got a chance to look through your new portfolio. Really impressive work — the case study layouts are clear and the project narratives flow well.</p><p>A couple of thoughts:</p><ul><li>The hero section loads a bit slowly on mobile</li><li>Love the micro-interactions on the project cards</li></ul>', 8),
      msg(t4, diego, [me], 'Re: Feedback on portfolio redesign', '<p>Thanks so much Jordan! That means a lot. You\'re right about the hero — I\'m loading a 4MB video there which is way too heavy. Going to swap it for an optimized WebP sequence.</p><p>The typography choices are really strong thanks to your recommendation on variable fonts.</p>', 3, { unread: true }),
    ],
  });

  const t5 = uid();
  threads.push({
    id: t5, accountId: acct2, subject: 'Sprint retro notes', snippet: 'Action item: reduce PR review turnaround to < 24h', unread: false, starred: false, pinned: false,
    participants: [me, liam, priya], lastMessageDate: ago(26), messageCount: 2, labels: [], type: 'conversation', messages: [
      msg(t5, liam, [me, priya], 'Sprint retro notes', '<p>Sharing notes from today\'s retro.</p><p><strong>What went well:</strong> shipped the auth migration on schedule, zero downtime.</p><p><strong>What to improve:</strong> PR reviews averaging 2.3 days. Target: &lt;24h.</p><p><strong>Action items:</strong></p><ol><li>Liam: set up review rotation schedule</li><li>Priya: document the new auth flow</li><li>Jordan: update the CI pipeline for faster checks</li></ol>', 28),
      msg(t5, priya, [me, liam], 'Re: Sprint retro notes', '<p>Good summary. I\'ve started the auth flow docs — should have them in Notion by end of week. Also +1 on the review rotation, we need to spread the load more evenly.</p>', 26),
    ],
  });

  const t6 = uid();
  threads.push({
    id: t6, accountId: acct1, subject: 'Apartment viewing Saturday', snippet: 'The one on Oak Street has in-unit laundry!', unread: true, starred: false, pinned: false,
    participants: [me, noor], lastMessageDate: ago(4), messageCount: 3, labels: [], type: 'conversation', messages: [
      msg(t6, noor, [me], 'Apartment viewing Saturday', '<p>Found two more places to look at this Saturday! One is a 2BR on Oak Street ($1,850/mo) and the other is a studio on Pine Ave ($1,200/mo). Both available March 1st.</p>', 18),
      msg(t6, me, [noor], 'Re: Apartment viewing Saturday', '<p>The Oak Street one looks promising — does it have in-unit laundry? That\'s my dealbreaker at this point.</p>', 10),
      msg(t6, noor, [me], 'Re: Apartment viewing Saturday', '<p>Yes! The one on Oak Street has in-unit laundry! Also has a small balcony. I booked viewings at 10am and 11:30am. Meet at Oak St first?</p>', 4, { unread: true }),
    ],
  });

  const t7 = uid();
  threads.push({
    id: t7, accountId: acct2, subject: 'API rate limiting proposal', snippet: 'Leaky bucket with burst allowance is the way to go', unread: false, starred: false, pinned: true,
    participants: [me, priya, liam, maya], lastMessageDate: ago(50), messageCount: 3, labels: [], type: 'conversation', messages: [
      msg(t7, priya, [me, liam, maya], 'API rate limiting proposal', '<p>Team — we need to implement rate limiting before the v3 launch. Proposal: 100 req/min per API key with a burst allowance of 20 extra within a 10s window.</p><p>Algorithm options: sliding window vs leaky bucket vs token bucket. I\'m leaning toward leaky bucket for simplicity.</p>', 72),
      msg(t7, liam, [me, priya, maya], 'Re: API rate limiting proposal', '<p>Leaky bucket with burst allowance is the way to go. I\'ve used it at my last company and it handled traffic spikes gracefully. One thing: we need to return proper 429 headers with retry-after values.</p>', 60),
      msg(t7, me, [priya, liam, maya], 'Re: API rate limiting proposal', '<p>Agree on leaky bucket. Let\'s also add per-endpoint limits for expensive operations (search, export). I\'ll draft the technical spec by Friday.</p>', 50),
    ],
  });

  const t8 = uid();
  threads.push({
    id: t8, accountId: acct1, subject: 'Book recommendation: Designing Data-Intensive Applications', snippet: 'Changed how I think about distributed systems', unread: false, starred: true, pinned: false,
    participants: [me, alex], lastMessageDate: ago(72), messageCount: 2, labels: [], type: 'conversation', messages: [
      msg(t8, alex, [me], 'Book recommendation: Designing Data-Intensive Applications', '<p>Hey Jordan, you mentioned wanting to learn more about distributed systems. I just finished "Designing Data-Intensive Applications" by Martin Kleppmann — it completely changed how I think about data replication, partitioning, and consistency models.</p><p>Highly recommend it, especially chapters 5-9.</p>', 96),
      msg(t8, me, [alex], 'Re: Book recommendation: Designing Data-Intensive Applications', '<p>Just ordered it — thanks Alex! I\'ve been meaning to dive deeper into this area especially with our sharding plans for Q4.</p>', 72),
    ],
  });

  // ── Newsletters ──

  const nl1 = uid();
  threads.push({
    id: nl1, accountId: acct1, subject: 'This Week in Design Systems — Issue #142', snippet: 'Figma variables deep dive, new CSS features, and component API patterns', unread: true, starred: false, pinned: false,
    participants: [{ name: 'Design Systems Weekly', email: 'newsletter@designsystems.email' }], lastMessageDate: ago(8), messageCount: 1, labels: [], type: 'newsletter',
    messages: [msg(nl1, { name: 'Design Systems Weekly', email: 'newsletter@designsystems.email' }, [me], 'This Week in Design Systems — Issue #142', '<h2>This Week in Design Systems</h2><p>Welcome to issue #142! This week we\'re covering Figma\'s new variable modes, three CSS features that just shipped in Chrome 124, and a deep dive into component API design patterns from the Shopify Polaris team.</p><h3>Figma Variables Deep Dive</h3><p>If you haven\'t tried Figma\'s variable modes yet, you\'re missing out. They finally solve the multi-theme problem...</p>', 8, { unread: true })],
    listUnsubscribe: 'mailto:unsub@designsystems.email',
  });

  const nl2 = uid();
  threads.push({
    id: nl2, accountId: acct1, subject: 'Bytes — Your weekly dose of JS', snippet: 'React 20 Server Components deep dive, Bun 1.3 benchmarks', unread: true, starred: false, pinned: false,
    participants: [{ name: 'Bytes', email: 'hello@bytes.dev' }], lastMessageDate: ago(14), messageCount: 1, labels: [], type: 'newsletter',
    messages: [msg(nl2, { name: 'Bytes', email: 'hello@bytes.dev' }, [me], 'Bytes — Your weekly dose of JS', '<h2>Bytes #287</h2><p>Happy Tuesday! This week: React 20 Server Components are finally stable (and actually make sense), Bun 1.3 dropped with some wild benchmark numbers, and we found a TypeScript trick that\'ll make your generic types 10x more readable.</p><p>Also, someone built a full-stack app with nothing but HTML attributes and we need to talk about it.</p>', 14, { unread: true })],
    listUnsubscribe: 'mailto:unsub@bytes.dev',
  });

  const nl3 = uid();
  threads.push({
    id: nl3, accountId: acct1, subject: 'Dense Discovery — Issue 289', snippet: 'Tools, apps, and resources for creative professionals', unread: false, starred: false, pinned: false,
    participants: [{ name: 'Dense Discovery', email: 'kai@densediscovery.com' }], lastMessageDate: ago(36), messageCount: 1, labels: [], type: 'newsletter',
    messages: [msg(nl3, { name: 'Dense Discovery', email: 'kai@densediscovery.com' }, [me], 'Dense Discovery — Issue 289', '<h2>Dense Discovery #289</h2><p>This week I want to highlight a beautifully crafted open-source email client that rethinks how we interact with our inbox. Instead of the usual chronological firehose, it groups emails by context and strips away visual clutter...</p>', 36)],
    listUnsubscribe: 'mailto:unsub@densediscovery.com',
  });

  const nl4 = uid();
  threads.push({
    id: nl4, accountId: acct2, subject: 'Pragmatic Engineer — The Pulse #98', snippet: 'Engineering layoffs are slowing, but hiring remains cautious', unread: false, starred: true, pinned: false,
    participants: [{ name: 'The Pragmatic Engineer', email: 'gergely@pragmaticengineer.com' }], lastMessageDate: ago(60), messageCount: 1, labels: [], type: 'newsletter',
    messages: [msg(nl4, { name: 'The Pragmatic Engineer', email: 'gergely@pragmaticengineer.com' }, [me], 'Pragmatic Engineer — The Pulse #98', '<h2>The Pulse #98</h2><p>This week: engineering layoffs are slowing across the industry, but hiring remains cautious. I analyzed 200+ job postings from top-tier companies and noticed some interesting shifts in what they\'re looking for...</p>', 60)],
    listUnsubscribe: 'mailto:unsub@pragmaticengineer.com',
  });

  const nl5 = uid();
  threads.push({
    id: nl5, accountId: acct1, subject: 'TLDR — Top tech news for March 27', snippet: 'Apple Vision Pro 2 rumors, GPT-5 benchmarks leaked, and Y Combinator W26 batch', unread: true, starred: false, pinned: false,
    participants: [{ name: 'TLDR', email: 'dan@tldrnewsletter.com' }], lastMessageDate: ago(4), messageCount: 1, labels: [], type: 'newsletter',
    messages: [msg(nl5, { name: 'TLDR', email: 'dan@tldrnewsletter.com' }, [me], 'TLDR — Top tech news for March 27', '<h2>TLDR Daily</h2><h3>Big Tech & Startups</h3><p><strong>Apple Vision Pro 2 reportedly entering mass production</strong> — supply chain reports suggest a lighter, cheaper model with improved eye tracking. Expected announcement at WWDC.</p><h3>Science & Futuristic Tech</h3><p><strong>New battery chemistry achieves 95% charge in 6 minutes</strong> — researchers at Stanford published results on a lithium-sulfur cell that could transform EV charging.</p>', 4, { unread: true })],
    listUnsubscribe: 'mailto:unsub@tldrnewsletter.com',
  });

  const nl6 = uid();
  threads.push({
    id: nl6, accountId: acct1, subject: 'Sidebar — Five interesting links for designers', snippet: 'A beautiful CSS art gallery, rethinking navigation patterns', unread: false, starred: false, pinned: false,
    participants: [{ name: 'Sidebar', email: 'hi@sidebar.io' }], lastMessageDate: ago(48), messageCount: 1, labels: [], type: 'newsletter',
    messages: [msg(nl6, { name: 'Sidebar', email: 'hi@sidebar.io' }, [me], 'Sidebar — Five interesting links for designers', '<h2>Sidebar</h2><p>Five interesting design links, hand-picked daily.</p><ol><li><strong>CSS Art Gallery</strong> — A curated collection of illustrations made entirely with CSS. Some of these are mind-blowing.</li><li><strong>Rethinking Navigation</strong> — How linear navigation patterns fail complex apps.</li></ol>', 48)],
    listUnsubscribe: 'mailto:unsub@sidebar.io',
  });

  // ── Notifications ──

  const n1 = uid();
  threads.push({
    id: n1, accountId: acct1, subject: '[mailautumn/core] PR #247: Implement thread grouping algorithm', snippet: 'sam-patel requested your review', unread: true, starred: false, pinned: false,
    participants: [{ name: 'GitHub', email: 'notifications@github.com' }], lastMessageDate: ago(1), messageCount: 1, labels: [], type: 'notification',
    messages: [msg(n1, { name: 'GitHub', email: 'notifications@github.com' }, [me], '[mailautumn/core] PR #247: Implement thread grouping algorithm', '<p><strong>sam-patel</strong> requested your review on <a href="#">#247 Implement thread grouping algorithm</a></p><p>This PR adds a new algorithm for grouping related emails into conversation threads based on References and In-Reply-To headers, with a fallback to subject-line matching.</p><p><em>+342 -89</em> across 6 files</p>', 1, { unread: true })],
  });

  const n2 = uid();
  threads.push({
    id: n2, accountId: acct2, subject: 'Figma: Alex Chen commented on "Navigation Redesign"', snippet: 'The tab bar feels heavy — can we try a floating action approach?', unread: true, starred: false, pinned: false,
    participants: [{ name: 'Figma', email: 'noreply@figma.com' }], lastMessageDate: ago(3), messageCount: 1, labels: [], type: 'notification',
    messages: [msg(n2, { name: 'Figma', email: 'noreply@figma.com' }, [me], 'Figma: Alex Chen commented on "Navigation Redesign"', '<p><strong>Alex Chen</strong> left a comment on <strong>Navigation Redesign v3</strong>:</p><blockquote>The tab bar feels heavy at 56px — can we try a floating action approach instead? I mocked up an alternative in the exploration frame.</blockquote>', 3, { unread: true })],
  });

  const n3 = uid();
  threads.push({
    id: n3, accountId: acct1, subject: 'Linear: DEV-1847 moved to In Review', snippet: 'API rate limiting — implementation complete', unread: false, starred: false, pinned: false,
    participants: [{ name: 'Linear', email: 'notifications@linear.app' }], lastMessageDate: ago(10), messageCount: 1, labels: [], type: 'notification',
    messages: [msg(n3, { name: 'Linear', email: 'notifications@linear.app' }, [me], 'Linear: DEV-1847 moved to In Review', '<p>Issue <strong>DEV-1847</strong> "API rate limiting — leaky bucket implementation" was moved to <strong>In Review</strong> by Priya Sharma.</p><p>Assignee: Jordan Rivera<br/>Priority: High<br/>Due: March 28</p>', 10)],
  });

  const n4 = uid();
  threads.push({
    id: n4, accountId: acct1, subject: 'Vercel: Deployment succeeded for mailautumn-web', snippet: 'Production deployment completed in 42s', unread: false, starred: false, pinned: false,
    participants: [{ name: 'Vercel', email: 'notifications@vercel.com' }], lastMessageDate: ago(7), messageCount: 1, labels: [], type: 'notification',
    messages: [msg(n4, { name: 'Vercel', email: 'notifications@vercel.com' }, [me], 'Vercel: Deployment succeeded for mailautumn-web', '<p>Your deployment to <strong>production</strong> was successful.</p><p>Project: mailautumn-web<br/>Branch: main<br/>Commit: <code>fix: thread grouping edge case</code><br/>Duration: 42s</p>', 7)],
  });

  const n5 = uid();
  threads.push({
    id: n5, accountId: acct2, subject: 'Slack: 3 new messages in #product-design', snippet: 'Emma shared the updated component library specs', unread: true, starred: false, pinned: false,
    participants: [{ name: 'Slack', email: 'notification@slack.com' }], lastMessageDate: ago(2), messageCount: 1, labels: [], type: 'notification',
    messages: [msg(n5, { name: 'Slack', email: 'notification@slack.com' }, [me], 'Slack: 3 new messages in #product-design', '<p>You have 3 new messages in <strong>#product-design</strong>:</p><p><strong>Emma Larsson</strong>: Shared the updated component library specs — see the Notion page for the full breakdown.<br/><strong>Sam Patel</strong>: Looks great, one question about the button variants.<br/><strong>Alex Chen</strong>: Meeting notes from the design review are up.</p>', 2, { unread: true })],
  });

  // ── Transactional ──

  const tx1 = uid();
  threads.push({
    id: tx1, accountId: acct1, subject: 'Your order has shipped — #ORD-29847', snippet: 'Estimated delivery: March 29', unread: true, starred: false, pinned: false,
    participants: [{ name: 'Analog Devices', email: 'orders@analogdevices.store' }], lastMessageDate: ago(6), messageCount: 1, labels: [], type: 'transactional',
    messages: [msg(tx1, { name: 'Analog Devices', email: 'orders@analogdevices.store' }, [me], 'Your order has shipped — #ORD-29847', '<p>Great news! Your order has shipped.</p><p><strong>Order #ORD-29847</strong></p><ul><li>Keychron Q2 Max Keyboard (Gateron Jupiter Red) — $189.00</li><li>Custom PBT Keycap Set — $45.00</li></ul><p>Estimated delivery: <strong>March 29</strong></p>', 6, { unread: true })],
  });

  const tx2 = uid();
  threads.push({
    id: tx2, accountId: acct1, subject: 'Payment received — Invoice #INV-2024-0342', snippet: 'We received your payment of $2,400.00', unread: false, starred: false, pinned: false,
    participants: [{ name: 'Cloudstack Billing', email: 'billing@cloudstack.io' }], lastMessageDate: ago(48), messageCount: 1, labels: [], type: 'transactional',
    messages: [msg(tx2, { name: 'Cloudstack Billing', email: 'billing@cloudstack.io' }, [me], 'Payment received — Invoice #INV-2024-0342', '<p>We received your payment.</p><p><strong>Amount:</strong> $2,400.00<br/><strong>Invoice:</strong> INV-2024-0342<br/><strong>Period:</strong> March 2026<br/><strong>Plan:</strong> Team (5 seats)</p><p>Thank you for your continued business!</p>', 48)],
  });

  const tx3 = uid();
  threads.push({
    id: tx3, accountId: acct2, subject: 'Your flight itinerary — SEA → SFO, April 2', snippet: 'Alaska Airlines flight AS1247, departing 7:15 AM', unread: false, starred: true, pinned: false,
    participants: [{ name: 'Alaska Airlines', email: 'reservations@alaskaair.com' }], lastMessageDate: ago(24), messageCount: 1, labels: [], type: 'transactional',
    messages: [msg(tx3, { name: 'Alaska Airlines', email: 'reservations@alaskaair.com' }, [me], 'Your flight itinerary — SEA → SFO, April 2', '<p>Your trip is confirmed!</p><p><strong>Flight:</strong> AS1247<br/><strong>Route:</strong> Seattle (SEA) → San Francisco (SFO)<br/><strong>Date:</strong> April 2, 2026<br/><strong>Departs:</strong> 7:15 AM<br/><strong>Arrives:</strong> 9:35 AM<br/><strong>Seat:</strong> 14A (Window)</p>', 24)],
  });

  const tx4 = uid();
  threads.push({
    id: tx4, accountId: acct1, subject: 'Your Uber receipt — $18.43', snippet: 'Trip from Downtown to Capitol Hill', unread: false, starred: false, pinned: false,
    participants: [{ name: 'Uber Receipts', email: 'noreply@uber.com' }], lastMessageDate: ago(30), messageCount: 1, labels: [], type: 'transactional',
    messages: [msg(tx4, { name: 'Uber Receipts', email: 'noreply@uber.com' }, [me], 'Your Uber receipt — $18.43', '<p>Thanks for riding with Uber.</p><p><strong>Trip total:</strong> $18.43<br/><strong>From:</strong> 4th Ave & Pike St<br/><strong>To:</strong> 15th Ave E & Republican St<br/><strong>Date:</strong> March 25, 2026 — 8:42 PM<br/><strong>Driver:</strong> Marcus (4.97)</p>', 30)],
  });

  // ── Marketing ──

  const mk1 = uid();
  threads.push({
    id: mk1, accountId: acct1, subject: '50% off annual plans — Spring sale ends Friday', snippet: 'Upgrade to Pro and unlock unlimited projects', unread: false, starred: false, pinned: false,
    participants: [{ name: 'Raycast', email: 'hello@raycast.com' }], lastMessageDate: ago(20), messageCount: 1, labels: [], type: 'marketing',
    messages: [msg(mk1, { name: 'Raycast', email: 'hello@raycast.com' }, [me], '50% off annual plans — Spring sale ends Friday', '<h2>Spring Sale</h2><p>For a limited time, get <strong>50% off</strong> Raycast Pro annual plans. Unlock AI commands, unlimited clipboard history, custom themes, and cloud sync.</p><p>Offer ends Friday, March 28.</p>', 20)],
    listUnsubscribe: 'mailto:unsub@raycast.com',
  });

  const mk2 = uid();
  threads.push({
    id: mk2, accountId: acct2, subject: 'New features in Arc Browser — March update', snippet: 'Introducing Spaces, Live Folders, and a redesigned sidebar', unread: false, starred: false, pinned: false,
    participants: [{ name: 'The Browser Company', email: 'updates@thebrowser.company' }], lastMessageDate: ago(40), messageCount: 1, labels: [], type: 'marketing',
    messages: [msg(mk2, { name: 'The Browser Company', email: 'updates@thebrowser.company' }, [me], 'New features in Arc Browser — March update', '<h2>What\'s new in Arc</h2><p>This month we\'re shipping three big updates:</p><ul><li><strong>Spaces 2.0</strong> — redesigned with drag-and-drop organization</li><li><strong>Live Folders</strong> — automatically group tabs by domain</li><li><strong>Sidebar redesign</strong> — cleaner, more customizable, and collapsible</li></ul>', 40)],
    listUnsubscribe: 'mailto:unsub@thebrowser.company',
  });

  const mk3 = uid();
  threads.push({
    id: mk3, accountId: acct1, subject: 'Your 2025 year in review', snippet: 'You wrote 847 commits, reviewed 234 PRs, and deployed 156 times', unread: false, starred: false, pinned: false,
    participants: [{ name: 'GitHub', email: 'noreply@github.com' }], lastMessageDate: ago(80), messageCount: 1, labels: [], type: 'marketing',
    messages: [msg(mk3, { name: 'GitHub', email: 'noreply@github.com' }, [me], 'Your 2025 year in review', '<h2>Your Year on GitHub</h2><p>Here\'s what you accomplished in 2025:</p><ul><li><strong>847</strong> commits pushed</li><li><strong>234</strong> pull requests reviewed</li><li><strong>156</strong> deployments triggered</li><li><strong>12</strong> repositories created</li></ul><p>Your most active month was October with 142 contributions. Keep building!</p>', 80)],
  });

  return threads;
}
