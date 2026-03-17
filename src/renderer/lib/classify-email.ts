import type { EmailType } from '../data/types';

interface ClassifyInput {
  subject: string;
  senderEmail: string;
  snippet: string;
  listUnsubscribe: string | null;
  messageCount: number;
}

// ── Sender patterns ──

const NOREPLY_SENDER = /^(noreply|no-reply|no_reply|donotreply|do-not-reply|do_not_reply)@/i;

const NEWSLETTER_SENDERS = /^(newsletter|news|digest|weekly|monthly|updates|editorial|editors?|blog|content|announcements?)@/i;
const NEWSLETTER_DOMAINS = /(substack\.com|mailchimp\.com|beehiiv\.com|convertkit\.com|buttondown\.email|ghost\.io|revue\.email|campaignmonitor\.com|sendgrid\.net|constantcontact\.com|mailerlite\.com|list-manage\.com|mailchimpapp\.net|email\.mg\.|mcsv\.net|customer\.io|iterable\.com|kmail-lists\.com)/i;

const NOTIFICATION_DOMAINS = /(github\.com|gitlab\.com|bitbucket\.org|linear\.app|slack\.com|notion\.so|figma\.com|asana\.com|trello\.com|atlassian\.(com|net)|vercel\.com|netlify\.com|discord\.com|twitter\.com|x\.com|facebook\.com|facebookmail\.com|linkedin\.com|instagram\.com|pinterest\.com|reddit\.com|stackoverflow\.com|medium\.com|youtube\.com|accounts\.google\.com|dropbox\.com|zoom\.us|calendly\.com|intercom\.io|zendesk\.com|freshdesk\.com|jira\.com|confluence\.com|loom\.com)/i;

const TRANSACTIONAL_SENDERS = /^(receipt|receipts|order|orders|billing|invoice|invoices|payments?|shipping)@/i;
const TRANSACTIONAL_DOMAINS = /(amazon\.(com|co\.\w+)|paypal\.com|stripe\.com|square\.com|venmo\.com|uber\.com|lyft\.com|doordash\.com|grubhub\.com|instacart\.com|shopify\.com|etsy\.com|ebay\.com|walmart\.com|target\.com|bestbuy\.com|steampowered\.com)/i;

const MARKETING_SENDERS = /^(marketing|promo|promos|offers?|deals?|sales?|store|shop|rewards|members?)@/i;
const MARKETING_DOMAINS = /(engage\.\w+\.com|email\.\w+\.com)/i;

// ── Subject patterns ──

const NOTIFICATION_SUBJECTS = /(\bmentioned you\b|\bcommented on\b|\bassigned (to )?you\b|\binvited you\b|\bshared with you\b|\bapproved\b|\bmerged\b|\bpushed to\b|\bopened (an? )?issue\b|\bpull request\b|\breview requested\b|\breplied to\b|\btagged you\b|\breacted\b|\bnew (sign[- ]?in|login)\b|\bsecurity alert\b|\bverify your\b|^\[action required\]|^\[feedback\]|^\[support\]|^\[alert\]|^\[notification\])/i;

const TRANSACTIONAL_SUBJECTS = /(\breceipt\b|\byour order\b|\border confirm|\binvoice\b|\bpayment (received|confirm|processed)\b|\bshipping (confirm|notification|update)\b|\bdelivery (confirm|notification|update)\b|\bpurchase confirm|\brefund\b|\bsubscription (confirm|renew|cancel)\b|\bbooking confirm|\breservation\b|\bitinerary\b|\be[- ]?ticket\b|\bboarding pass\b)/i;

const NEWSLETTER_SUBJECTS = /(\bnewsletter\b|\bweekly digest\b|\bmonthly digest\b|\bdaily digest\b|\bweekly roundup\b|\bmonthly roundup\b|\bweekly update\b|\bthis week in\b|\bweekly brief\b|\bmorning brew\b)/i;

const MARKETING_SUBJECTS = /(\d+%\s*off\b|\bflash sale\b|\blimited time\b|\bexclusive (offer|deal|access)\b|\bdon'?t miss\b|\blast chance\b|\bfree (shipping|trial|gift)\b|\bsave \$?\d+\b|\bspecial offer\b|\bclearance\b|\bdiscount\b|\bbuy one get\b|\bpromo(tion)?\b|\bdeal of\b|\bblack friday\b|\bcyber monday\b|\bholiday (sale|deal|offer)\b)/i;

const CALENDAR_SUBJECTS = /(\binvitation:\b|\bcalendar event\b|\brsvp\b|\bmeeting (request|invite|scheduled)\b|\bevent (reminder|update|cancel)\b)/i;

// ── Classifier ──

export function classifyEmail(input: ClassifyInput): EmailType {
  const { subject, senderEmail, listUnsubscribe } = input;
  const senderDomain = senderEmail.split('@')[1] || '';
  const isNoreply = NOREPLY_SENDER.test(senderEmail);

  // Calendar — check first (very specific)
  if (CALENDAR_SUBJECTS.test(subject)) {
    return 'calendar';
  }

  // Transactional — receipts, orders, shipping
  if (TRANSACTIONAL_SUBJECTS.test(subject)) {
    return 'transactional';
  }
  if (TRANSACTIONAL_DOMAINS.test(senderDomain) && (TRANSACTIONAL_SENDERS.test(senderEmail) || isNoreply)) {
    return 'transactional';
  }

  // Notification — app notifications, security alerts
  if (NOTIFICATION_DOMAINS.test(senderDomain)) {
    return 'notification';
  }
  if (NOTIFICATION_SUBJECTS.test(subject)) {
    // Notification subjects from noreply senders = notification
    if (isNoreply) return 'notification';
    // Notification subjects from any sender = notification
    return 'notification';
  }

  // Marketing — promotional emails (check before newsletter)
  if (MARKETING_SUBJECTS.test(subject)) {
    if (listUnsubscribe || MARKETING_SENDERS.test(senderEmail)) return 'marketing';
    // "Don't miss your tax discount" from announcements@ is marketing
    if (NEWSLETTER_SENDERS.test(senderEmail)) return 'marketing';
  }
  if (MARKETING_SENDERS.test(senderEmail)) {
    return 'marketing';
  }

  // Newsletter — bulk sender patterns
  if (NEWSLETTER_SENDERS.test(senderEmail)) {
    return 'newsletter';
  }
  if (NEWSLETTER_DOMAINS.test(senderDomain)) {
    return 'newsletter';
  }
  if (NEWSLETTER_SUBJECTS.test(subject) && listUnsubscribe) {
    return 'newsletter';
  }

  // Generic list-unsubscribe: strong signal for newsletter/marketing
  if (listUnsubscribe) {
    if (MARKETING_SUBJECTS.test(subject)) return 'marketing';
    // noreply + unsubscribe = newsletter
    return 'newsletter';
  }

  // noreply@ senders that didn't match above — likely notifications
  if (isNoreply && !listUnsubscribe) {
    return 'notification';
  }

  // Conversation (default) — human-to-human email
  return 'conversation';
}
