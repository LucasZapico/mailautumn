/**
 * Email type classifier — runs in main process with direct DB access.
 * Uses sender, subject, list-unsubscribe, and body HTML signals.
 */

export type EmailType =
  | 'conversation'
  | 'newsletter'
  | 'notification'
  | 'transactional'
  | 'marketing'
  | 'calendar';

export interface ClassifyInput {
  senderEmail: string;
  subject: string;
  listUnsubscribe: string | null;
  bodyHints?: BodyHints | null;
  /** Number of distinct participants in the thread */
  participantCount?: number;
  /** Number of messages in the thread */
  messageCount?: number;
}

/** Lightweight body signals extracted by SQL or a fast scan — NOT the full HTML */
export interface BodyHints {
  hasUnsubLink: boolean;      // <a...>unsubscribe</a> in body
  hasTrackingPixel: boolean;  // 1×1 img or tracking pixel patterns
  hasOrderTable: boolean;     // order/receipt/invoice table patterns
  hasReplyQuotes: boolean;    // "On ... wrote:" or "From:...Sent:...To:" patterns
  imgCount: number;           // total <img> tags
  linkCount: number;          // total <a> tags
  bodyLength: number;         // raw HTML length
}

// ── noreply patterns ──
const NOREPLY = /^(noreply|no-reply|no_reply|donotreply|do-not-reply|do_not_reply|mailer-daemon|postmaster|calendar-notification)@/i;

// ── Bulk sender subdomain — @email.X.com, @mail.X.com, @news.X.com, etc. ──
// Companies route marketing/newsletter email through subdomains like email.apple.com, email.venmo.com
const BULK_SUBDOMAIN = /^.+@(email|mail|e-mail|em|m|news|campaign|send|sender|notify|updates?|mailer|promo|offers?|marketing|engage|go|t|bounce)\..+\..+$/i;

// ── Transactional sender patterns ──
const TRANSACT_SENDERS = /^(order[s-]?|order-update|orders?|payment[s-]?|payments?-update|billing|invoice|receipt[s-]?|shipping|delivery|renewal[s-]?|account[s-]?|support|fulfillment|confirmation)@/i;

// ── Notification ──
const NOTIF_DOMAINS = [
  'github.com', 'gitlab.com', 'bitbucket.org', 'linear.app',
  'slack.com', 'notion.so', 'figma.com', 'asana.com', 'trello.com',
  'atlassian.com', 'atlassian.net', 'vercel.com', 'netlify.com',
  'discord.com', 'twitter.com', 'x.com',
  'facebook.com', 'facebookmail.com', 'linkedin.com', 'instagram.com',
  'pinterest.com', 'reddit.com', 'stackoverflow.com', 'medium.com',
  'youtube.com', 'dropbox.com', 'zoom.us', 'calendly.com',
  'intercom.io', 'zendesk.com', 'freshdesk.com', 'loom.com',
  'accounts.google.com', 'google.com',
  // Developer/DevOps
  'sentry.io', 'pagerduty.com', 'datadog.com', 'circleci.com',
  'travis-ci.com', 'fly.io', 'railway.app', 'render.com',
  // Communities
  'dev.to', 'hashnode.com', 'producthunt.com',
  // Domain/hosting alerts
  'improvmx.com', 'cloudflare.com', 'namecheap.com',
  'porkbun.com', 'godaddy.com', 'hover.com',
  // Forums / social
  'domestika.org', 'discourse.org',
  // Developer tools & communities
  'codepen.io', 'gitkraken.com', 'daily.dev', 'replit.com',
  'stackblitz.com', 'codesandbox.io', 'npmjs.com',
  // Streaming / media
  'twitch.tv', 'spotify.com', 'tiktok.com', 'snapchat.com',
  // Real estate / services
  'redfin.com', 'zillow.com', 'trulia.com',
  // Finance alerts
  'mint.com', 'creditkarma.com', 'robinhood.com', 'coinbase.com',
];

const NOTIF_SUBJECT = /(\bsecurity alert\b|\bsign[- ]?in\b|\bnew login\b|\bverify your\b|\bverification\b|\b2fa\b|\btwo[- ]?factor\b|\bmentioned you\b|\bcommented on\b|\bassigned\b|\binvited you\b|\bshared with you\b|\bmerged\b|\bpull request\b|\breview requested\b|\breplied to\b|\btagged you\b|\breacted\b|\baction required\b|\bfeedback\b|\bMX settings\b|\bDNS\b)/i;

const NOTIF_SUBJECT_BRACKET = /^\[(action required|feedback|support|alert|notification|warning|update)\]/i;

// ── Transactional ──
const TRANSACT_SUBJECT = /(\breceipt\b|\byour order\b|\border confirm|\border.*(cancel|ship)|\binvoice\b|\bpayment (received|confirm|processed|declined)\b|\bshipping (confirm|notification|update)\b|\bdelivery (confirm|notification|update)\b|\bpurchase confirm|\brefund\b|\bsubscription (confirm|renew|cancel|will renew)\b|\bbooking confirm|\breservation\b|\bitinerary\b|\be[- ]?ticket\b|\bboarding pass\b|\baccount statement\b|\bauto[- ]?renew|\brenewal\b|\btop up.*balance\b|\b(paid|sent) you \$|\byour.*transfer\b|\bupcoming.*subscription\b|\blogin code\b|\baccess code\b|\bverification code\b)/i;

const TRANSACT_DOMAINS = [
  'amazon.com', 'paypal.com', 'stripe.com', 'square.com', 'venmo.com',
  'uber.com', 'lyft.com', 'doordash.com', 'grubhub.com', 'instacart.com',
  'shopify.com', 'etsy.com', 'ebay.com', 'walmart.com', 'apple.com',
  // Additional commerce / payments
  'cashapp.com', 'zelle.com', 'wise.com', 'revolut.com',
  'fedex.com', 'ups.com', 'usps.com', 'dhl.com',
  'airbnb.com', 'booking.com', 'expedia.com',
  'moo.com', 'vistaprint.com',
  // Registrars / services with billing
  'incfile.com', 'bizee.com', 'legalzoom.com',
  'lucy.co', 'macpaw.com',
];

// ── Newsletter ──
const NL_SENDERS = /^(newsletter|news|digest|weekly|monthly|editorial|editors?|blog|content|announcements?|updates|info|team|hello|community)@/i;

const NL_DELIVERY_DOMAINS = [
  'substack.com', 'mailchimp.com', 'beehiiv.com', 'convertkit.com',
  'buttondown.email', 'ghost.io', 'revue.email', 'campaignmonitor.com',
  'sendgrid.net', 'constantcontact.com', 'mailerlite.com',
  'list-manage.com', 'mailchimpapp.net', 'customer.io', 'iterable.com',
  'kmail-lists.com', 'hubspot.com', 'hubspotlinks.com', 'drip.com',
  'getresponse.com', 'aweber.com', 'activecampaign.com',
  'improvmx.com', 'mlsend.com', 'sendinblue.com', 'brevo.com',
];

const NL_SUBJECT = /(\bnewsletter\b|\bweekly digest\b|\bmonthly digest\b|\bdaily digest\b|\bweekly roundup\b|\bmonthly roundup\b|\bweekly update\b|\bthis week in\b|\bdigest\b)/i;

// Sender name patterns that strongly suggest newsletter
const NL_SENDER_NAMES = /\b(digest|newsletter|weekly|bulletin|briefing|roundup)\b/i;

// ── Impersonal sender local-parts — brand-style addresses unlikely to be a person ──
const IMPERSONAL_SENDERS = /^(yo|drink|vip|care|listings?|discover|getstarted|learn|welcome|onboarding|growth|partnerships?|creators?|stories|explore|picks|trending|curated|spotlight|highlights?)@/i;

// ── Marketing ──
const MKTG_SENDERS = /^(marketing|promo|promos|offers?|deals?|sales?|store|shop|rewards|members?)@/i;

const MKTG_SUBJECT = /(\d+%\s*off\b|\bflash sale\b|\blimited time\b|\bexclusive (offer|deal|access)\b|\bdon'?t miss\b|\blast chance\b|\bfree (shipping|trial|gift)\b|\bsave \$?\d+\b|\bspecial offer\b|\bclearance\b|\bdiscount\b|\bbuy one get\b|\bdeal of\b|\bblack friday\b|\bcyber monday\b|\bmember[- ]?only\b|\bwin\b.*\bprize)/i;

// ── Calendar ──
const CAL_SUBJECT = /(\binvitation:\b|\bcalendar event\b|\brsvp\b|\bmeeting (request|invite|scheduled)\b|\bevent (reminder|update|cancel)\b)/i;

// ── Helpers ──

function domainMatches(senderDomain: string, domains: string[]): boolean {
  for (const d of domains) {
    if (senderDomain === d || senderDomain.endsWith('.' + d)) return true;
  }
  return false;
}

/** Check if body hints suggest a bulk/template email (newsletter or marketing) */
function isBulkBody(hints: BodyHints | null | undefined): boolean {
  if (!hints) return false;
  // Rich HTML with many images and links → bulk email template
  if (hints.imgCount >= 3 && hints.linkCount >= 5 && hints.bodyLength > 10000) return true;
  // Has unsubscribe link in body (even without header)
  if (hints.hasUnsubLink) return true;
  // Has tracking pixel
  if (hints.hasTrackingPixel) return true;
  return false;
}

/** Check if body hints suggest a transactional email */
function isTransactBody(hints: BodyHints | null | undefined): boolean {
  if (!hints) return false;
  return hints.hasOrderTable;
}

// ── Conversation signals ──

/** Detect if this looks like a human conversation despite bulk signals */
function looksLikeConversation(input: ClassifyInput): boolean {
  const { participantCount, messageCount, bodyHints, senderEmail } = input;
  const isNoreply = NOREPLY.test(senderEmail);
  // 3+ participants = actual multi-party conversation (2 is just sender + recipient, always true)
  if (participantCount && participantCount >= 3) return true;
  // 2 participants with multiple messages AND reply quotes = back-and-forth conversation
  // (not just a newsletter with a quoted footer)
  if (participantCount && participantCount >= 2 && messageCount && messageCount >= 2
      && bodyHints?.hasReplyQuotes && !isNoreply) return true;
  return false;
}

export interface ClassifyResult {
  type: EmailType;
  /** Whether this was a weak/fallback classification that AI should double-check */
  lowConfidence: boolean;
}

// ── Classifier ──

export function classifyEmail(input: ClassifyInput): ClassifyResult {
  const { senderEmail, subject, listUnsubscribe, bodyHints } = input;
  const domain = (senderEmail.split('@')[1] || '').toLowerCase();
  const isNoreply = NOREPLY.test(senderEmail);
  const hasUnsub = !!listUnsubscribe;
  const senderName = senderEmail.split('@')[0] || '';
  const isConversational = looksLikeConversation(input);

  const high = (type: EmailType): ClassifyResult => ({ type, lowConfidence: false });
  const low = (type: EmailType): ClassifyResult => ({ type, lowConfidence: true });
  const isBulkSubdomain = BULK_SUBDOMAIN.test(senderEmail);
  const isImpersonal = IMPERSONAL_SENDERS.test(senderEmail);

  // Calendar (very specific)
  if (CAL_SUBJECT.test(subject)) return high('calendar');

  // Transactional — receipts, orders, shipping, payments, codes
  if (TRANSACT_SUBJECT.test(subject)) return high('transactional');
  if (domainMatches(domain, TRANSACT_DOMAINS) && (isNoreply || TRANSACT_SENDERS.test(senderEmail))) return high('transactional');
  if (TRANSACT_SENDERS.test(senderEmail) && !hasUnsub) return high('transactional');
  if (isTransactBody(bodyHints) && (isNoreply || TRANSACT_SENDERS.test(senderEmail))) return high('transactional');

  // Notification — app alerts, security, action-required
  if (domainMatches(domain, NOTIF_DOMAINS) && !hasUnsub) return high('notification');
  if (NOTIF_SUBJECT.test(subject) || NOTIF_SUBJECT_BRACKET.test(subject)) return high('notification');

  // Marketing — promos, sales (check before newsletter)
  if (MKTG_SUBJECT.test(subject) && (hasUnsub || MKTG_SENDERS.test(senderEmail) || isBulkBody(bodyHints))) return high('marketing');
  if (MKTG_SENDERS.test(senderEmail)) return high('marketing');

  // Newsletter — explicit newsletter senders/platforms (strong signals)
  if (NL_SENDERS.test(senderEmail)) return high('newsletter');
  if (domainMatches(domain, NL_DELIVERY_DOMAINS)) return high('newsletter');
  if (NL_SUBJECT.test(subject)) return high('newsletter');
  if (NL_SENDER_NAMES.test(senderName)) return high('newsletter');

  // ── Bulk subdomain — @email.X.com, @mail.X.com, etc. ──
  // These are almost never human senders. With list-unsubscribe or bulk body → high confidence.
  // Without, still a strong signal → low confidence (let AI verify).
  if (isBulkSubdomain) {
    if (hasUnsub || isBulkBody(bodyHints)) {
      if (MKTG_SUBJECT.test(subject)) return high('marketing');
      if (TRANSACT_SUBJECT.test(subject) || isTransactBody(bodyHints)) return high('transactional');
      return high('newsletter');
    }
    return low('newsletter');
  }

  // ── Impersonal sender + bulk signals ──
  // Addresses like yo@, drink@, vip@ are not human names — likely brand email.
  if (isImpersonal && (hasUnsub || isBulkBody(bodyHints))) {
    if (MKTG_SUBJECT.test(subject)) return high('marketing');
    return high('newsletter');
  }

  // ── Conversation override ──
  // If thread has multiple participants or reply quotes, it's a human conversation
  // even if it has list-unsubscribe (business email providers add this) or bulk body signals
  // (long quoted threads with rich signatures look like bulk email to body heuristics)
  if (isConversational) return high('conversation');

  // list-unsubscribe header — weak signal, let AI verify
  if (hasUnsub) {
    if (MKTG_SUBJECT.test(subject)) return low('marketing');
    return low('newsletter');
  }

  // Body-based: unsubscribe link / tracking pixel / rich template — weak signal
  if (isBulkBody(bodyHints)) {
    if (MKTG_SUBJECT.test(subject)) return low('marketing');
    return low('newsletter');
  }

  // Impersonal sender without other signals — weak newsletter guess
  if (isImpersonal) return low('newsletter');

  // noreply without list-unsubscribe and no other match → notification
  if (isNoreply) return high('notification');

  // Default: human conversation — let AI verify in case it's actually a newsletter etc.
  return low('conversation');
}
