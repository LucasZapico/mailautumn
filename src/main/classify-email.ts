/**
 * Email type classifier — conservative heuristics.
 *
 * Philosophy: default to 'conversation'. Only classify as newsletter/notification/
 * transactional/marketing when signals are overwhelmingly strong (known platform
 * domain + noreply sender + no reply quotes). False negatives (newsletter in
 * conversations) are less annoying than false positives (conversations in newsletters).
 *
 * This is a stopgap — the plan is AI-first classification with heuristics as fallback.
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
  participantCount?: number;
  messageCount?: number;
}

export interface BodyHints {
  hasUnsubLink: boolean;
  hasTrackingPixel: boolean;
  hasOrderTable: boolean;
  hasReplyQuotes: boolean;
  imgCount: number;
  linkCount: number;
  bodyLength: number;
}

export interface ClassifyResult {
  type: EmailType;
  lowConfidence: boolean;
}

// ── Known platform domains (very high confidence) ──

const NOTIF_DOMAINS = [
  'github.com', 'gitlab.com', 'bitbucket.org', 'linear.app',
  'slack.com', 'notion.so', 'figma.com', 'asana.com', 'trello.com',
  'atlassian.com', 'atlassian.net', 'vercel.com', 'netlify.com',
  'discord.com', 'twitter.com', 'x.com',
  'facebook.com', 'facebookmail.com', 'linkedin.com', 'instagram.com',
  'pinterest.com', 'reddit.com', 'stackoverflow.com', 'medium.com',
  'youtube.com', 'dropbox.com', 'zoom.us', 'calendly.com',
  'intercom.io', 'zendesk.com', 'freshdesk.com', 'loom.com',
  'sentry.io', 'pagerduty.com', 'datadog.com', 'circleci.com',
  'fly.io', 'railway.app', 'render.com',
  'cloudflare.com', 'namecheap.com', 'porkbun.com', 'godaddy.com',
];

const TRANSACT_DOMAINS = [
  'amazon.com', 'paypal.com', 'stripe.com', 'square.com', 'venmo.com',
  'uber.com', 'lyft.com', 'doordash.com', 'grubhub.com', 'instacart.com',
  'shopify.com', 'etsy.com', 'ebay.com', 'walmart.com', 'apple.com',
  'cashapp.com', 'wise.com', 'revolut.com',
  'fedex.com', 'ups.com', 'usps.com', 'dhl.com',
  'airbnb.com', 'booking.com', 'expedia.com',
];

const NL_DELIVERY_DOMAINS = [
  'substack.com', 'mailchimp.com', 'beehiiv.com', 'convertkit.com',
  'buttondown.email', 'ghost.io', 'revue.email', 'campaignmonitor.com',
  'sendgrid.net', 'constantcontact.com', 'mailerlite.com',
  'list-manage.com', 'customer.io', 'iterable.com',
  'kmail-lists.com', 'hubspot.com', 'drip.com',
  'getresponse.com', 'aweber.com', 'activecampaign.com',
  'mlsend.com', 'brevo.com',
];

// ── Sender patterns (must be noreply-style to count) ──

const NOREPLY = /^(noreply|no-reply|no_reply|donotreply|do-not-reply|mailer-daemon|postmaster|calendar-notification)@/i;
const TRANSACT_SENDERS = /^(order[s-]?|payment[s-]?|billing|invoice|receipt[s-]?|shipping|delivery|fulfillment|confirmation)@/i;

// ── Subject patterns (very specific — only match clear-cut cases) ──

const CAL_SUBJECT = /(\binvitation:\b|\bcalendar event\b|\bmeeting (request|invite)\b)/i;

const TRANSACT_SUBJECT = /(\breceipt\b|\byour order\b|\border confirm|\binvoice\b|\bpayment (received|confirm|processed)\b|\bshipping (confirm|update)\b|\bdelivery (confirm|update)\b|\brefund\b|\bboarding pass\b|\be[- ]?ticket\b)/i;

const MKTG_SUBJECT = /(\d+%\s*off\b|\bflash sale\b|\blimited time\b|\bfree shipping\b|\bclearance\b|\bbuy one get\b|\bblack friday\b|\bcyber monday\b)/i;

// ── Helpers ──

function domainOf(email: string): string {
  return (email.split('@')[1] || '').toLowerCase();
}

function domainMatches(senderDomain: string, domains: string[]): boolean {
  for (const d of domains) {
    if (senderDomain === d || senderDomain.endsWith('.' + d)) return true;
  }
  return false;
}

function hasReplySignals(input: ClassifyInput): boolean {
  return !!(input.bodyHints?.hasReplyQuotes || (input.messageCount && input.messageCount >= 2));
}

// ── Classifier ──

export function classifyEmail(input: ClassifyInput): ClassifyResult {
  const { senderEmail, subject, listUnsubscribe } = input;
  const domain = domainOf(senderEmail);
  const isNoreply = NOREPLY.test(senderEmail);
  const hasReplies = hasReplySignals(input);

  const high = (type: EmailType): ClassifyResult => ({ type, lowConfidence: false });
  const low = (type: EmailType): ClassifyResult => ({ type, lowConfidence: true });

  // ── Calendar (very specific subject) ──
  if (CAL_SUBJECT.test(subject)) return high('calendar');

  // ── Transactional — only when sender OR domain is clearly transactional ──
  if (TRANSACT_SUBJECT.test(subject) && (isNoreply || TRANSACT_SENDERS.test(senderEmail))) return high('transactional');
  if (domainMatches(domain, TRANSACT_DOMAINS) && isNoreply) return high('transactional');
  if (TRANSACT_SENDERS.test(senderEmail)) return high('transactional');

  // ── If there are reply signals, it's a conversation — full stop ──
  // Real back-and-forth email is never a newsletter/notification.
  if (hasReplies) return high('conversation');

  // ── Notification — known platform + noreply ──
  if (domainMatches(domain, NOTIF_DOMAINS) && isNoreply) return high('notification');
  // Known platform without noreply — still likely notification, but lower confidence
  if (domainMatches(domain, NOTIF_DOMAINS)) return low('notification');

  // ── Marketing — very specific subject patterns + noreply or list-unsubscribe ──
  if (MKTG_SUBJECT.test(subject) && (isNoreply || !!listUnsubscribe)) return high('marketing');

  // ── Newsletter — only from known delivery platforms ──
  if (domainMatches(domain, NL_DELIVERY_DOMAINS)) return high('newsletter');

  // ── Noreply + list-unsubscribe = probably newsletter, low confidence ──
  if (isNoreply && !!listUnsubscribe) return low('newsletter');

  // ── Default: conversation ──
  return low('conversation');
}

// ── Body hint extraction (called from database.ts) ──

export function extractBodyHints(bodyValue: string | null): BodyHints | null {
  if (!bodyValue || bodyValue.length < 50) return null;
  const lower = bodyValue.toLowerCase();
  return {
    hasUnsubLink: /unsubscribe/i.test(lower) && /<a\b/i.test(lower),
    hasTrackingPixel: /width=["']?1["']?\b.*height=["']?1["']?\b/i.test(lower),
    hasOrderTable: /\b(order|invoice|receipt|payment|total|subtotal)\b/i.test(lower) && /<table\b/i.test(lower),
    hasReplyQuotes: /On .{5,80} wrote:/i.test(lower) || /From:.*Sent:.*To:/is.test(lower),
    imgCount: (lower.match(/<img\b/g) || []).length,
    linkCount: (lower.match(/<a\b/g) || []).length,
    bodyLength: bodyValue.length,
  };
}
