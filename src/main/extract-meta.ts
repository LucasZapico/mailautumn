/**
 * Extract structured ThreadMeta from email subject/snippet/sender.
 * Produces the notification and transaction card data that the
 * UpdatesFeed and ReceiptsFeed components render.
 */

import type { EmailType } from './classify-email';

// ── Output types (mirrors renderer ThreadMeta) ──

export interface NotificationMeta {
  kind: 'notification';
  service: string;
  serviceColor: string;
  action: string;
  actor: string;
  entity?: string;
  quote?: string;
  stats?: string;
  ctaLabel?: string;
}

export interface TransactionMeta {
  kind: 'transaction';
  type: 'payment' | 'shipping' | 'delivery' | 'security' | 'subscription' | 'ride';
  status: string;
  statusLabel: string;
  statusColor: string;
  amount?: string;
  merchant?: string;
  items?: string[];
  details: { label: string; value: string }[];
  ctaLabel?: string;
}

export type ThreadMeta = NotificationMeta | TransactionMeta;

// ── Service registry ──

interface ServiceInfo {
  name: string;
  color: string;
  ctaLabel: string;
}

const SERVICE_MAP: Record<string, ServiceInfo> = {
  'github.com':       { name: 'GitHub',       color: '#8b5cf6', ctaLabel: 'View on GitHub' },
  'gitlab.com':       { name: 'GitLab',       color: '#fc6d26', ctaLabel: 'View on GitLab' },
  'bitbucket.org':    { name: 'Bitbucket',    color: '#0052cc', ctaLabel: 'View on Bitbucket' },
  'linear.app':       { name: 'Linear',       color: '#5e6ad2', ctaLabel: 'View Issue' },
  'slack.com':        { name: 'Slack',         color: '#e01e5a', ctaLabel: 'Open in Slack' },
  'notion.so':        { name: 'Notion',        color: '#000000', ctaLabel: 'Open in Notion' },
  'figma.com':        { name: 'Figma',         color: '#a259ff', ctaLabel: 'Open in Figma' },
  'asana.com':        { name: 'Asana',         color: '#f06a6a', ctaLabel: 'View in Asana' },
  'trello.com':       { name: 'Trello',        color: '#0079bf', ctaLabel: 'View in Trello' },
  'atlassian.com':    { name: 'Atlassian',     color: '#0052cc', ctaLabel: 'View' },
  'atlassian.net':    { name: 'Jira',          color: '#0052cc', ctaLabel: 'View Issue' },
  'vercel.com':       { name: 'Vercel',        color: '#000000', ctaLabel: 'View Deployment' },
  'netlify.com':      { name: 'Netlify',       color: '#00c7b7', ctaLabel: 'View Deploy' },
  'discord.com':      { name: 'Discord',       color: '#5865f2', ctaLabel: 'Open in Discord' },
  'twitter.com':      { name: 'Twitter',       color: '#1da1f2', ctaLabel: 'View on Twitter' },
  'x.com':            { name: 'X',             color: '#000000', ctaLabel: 'View on X' },
  'facebook.com':     { name: 'Facebook',      color: '#1877f2', ctaLabel: 'View on Facebook' },
  'facebookmail.com': { name: 'Facebook',      color: '#1877f2', ctaLabel: 'View on Facebook' },
  'linkedin.com':     { name: 'LinkedIn',      color: '#0a66c2', ctaLabel: 'View on LinkedIn' },
  'instagram.com':    { name: 'Instagram',     color: '#e4405f', ctaLabel: 'View on Instagram' },
  'pinterest.com':    { name: 'Pinterest',     color: '#e60023', ctaLabel: 'View Pin' },
  'reddit.com':       { name: 'Reddit',        color: '#ff4500', ctaLabel: 'View on Reddit' },
  'stackoverflow.com':{ name: 'Stack Overflow',color: '#f48024', ctaLabel: 'View Question' },
  'medium.com':       { name: 'Medium',        color: '#000000', ctaLabel: 'Read on Medium' },
  'youtube.com':      { name: 'YouTube',       color: '#ff0000', ctaLabel: 'Watch on YouTube' },
  'dropbox.com':      { name: 'Dropbox',       color: '#0061ff', ctaLabel: 'View in Dropbox' },
  'zoom.us':          { name: 'Zoom',          color: '#2d8cff', ctaLabel: 'Join Meeting' },
  'calendly.com':     { name: 'Calendly',      color: '#006bff', ctaLabel: 'View Event' },
  'intercom.io':      { name: 'Intercom',      color: '#286efa', ctaLabel: 'View Conversation' },
  'zendesk.com':      { name: 'Zendesk',       color: '#03363d', ctaLabel: 'View Ticket' },
  'freshdesk.com':    { name: 'Freshdesk',     color: '#25c16f', ctaLabel: 'View Ticket' },
  'loom.com':         { name: 'Loom',          color: '#625df5', ctaLabel: 'Watch Video' },
  'sentry.io':        { name: 'Sentry',        color: '#362d59', ctaLabel: 'View Issue' },
  'pagerduty.com':    { name: 'PagerDuty',     color: '#06ac38', ctaLabel: 'View Incident' },
  'datadog.com':      { name: 'Datadog',       color: '#632ca6', ctaLabel: 'View Alert' },
  'circleci.com':     { name: 'CircleCI',      color: '#343434', ctaLabel: 'View Build' },
  'travis-ci.com':    { name: 'Travis CI',     color: '#3eaaaf', ctaLabel: 'View Build' },
  'google.com':       { name: 'Google',        color: '#4285f4', ctaLabel: 'View' },
  'accounts.google.com': { name: 'Google',     color: '#4285f4', ctaLabel: 'View' },
  'apple.com':        { name: 'Apple',         color: '#000000', ctaLabel: 'View' },
  'canva.com':        { name: 'Canva',         color: '#00c4cc', ctaLabel: 'Open in Canva' },
  'miro.com':         { name: 'Miro',          color: '#ffd02f', ctaLabel: 'Open in Miro' },
  'airtable.com':     { name: 'Airtable',      color: '#18bfff', ctaLabel: 'View in Airtable' },
  'coda.io':          { name: 'Coda',          color: '#f46a54', ctaLabel: 'Open in Coda' },
};

function lookupService(domain: string): ServiceInfo | null {
  // Direct match
  if (SERVICE_MAP[domain]) return SERVICE_MAP[domain];
  // Subdomain match (e.g., notifications.github.com → github.com)
  for (const [key, val] of Object.entries(SERVICE_MAP)) {
    if (domain.endsWith('.' + key)) return val;
  }
  return null;
}

// ── Notification extraction ──

// Patterns: "Person action" or "[Repo] Action: entity"
const ACTOR_ACTION_PATTERNS: { pattern: RegExp; actor: number; action: string; entity?: number }[] = [
  // GitHub: "[repo] PR #123: title" or "user requested your review"
  { pattern: /^\[([^\]]+)\]\s+(.+)$/, actor: 0, action: '', entity: 2 },
  // "Person mentioned you in X"
  { pattern: /^(.+?)\s+mentioned you\s+in\s+["""]?(.+?)["""]?\s*$/, actor: 1, action: 'mentioned you in', entity: 2 },
  // "Person mentioned you in a comment"
  { pattern: /^(.+?)\s+mentioned you\s+in\s+a\s+(.+)$/, actor: 1, action: 'mentioned you in', entity: 2 },
  // "Person commented on X"
  { pattern: /^(.+?)\s+commented on\s+(.+)$/, actor: 1, action: 'commented on', entity: 2 },
  // "New comment on ISSUE: title"
  { pattern: /^New comment on\s+(.+)$/, actor: 0, action: 'new comment on', entity: 1 },
  // "Person requested your review on X"
  { pattern: /^(.+?)\s+requested your review on\s+(.+)$/, actor: 1, action: 'requested your review on', entity: 2 },
  // "#channel: Person mentioned you"
  { pattern: /^#(\S+):\s+(.+?)\s+mentioned you$/, actor: 2, action: 'mentioned you in', entity: 1 },
  // "Person assigned you to X"
  { pattern: /^(.+?)\s+assigned you to\s+(.+)$/, actor: 1, action: 'assigned you to', entity: 2 },
  // "Person shared X with you"
  { pattern: /^(.+?)\s+shared\s+["""]?(.+?)["""]?\s+with you$/, actor: 1, action: 'shared with you', entity: 2 },
  // "Person invited you to X"
  { pattern: /^(.+?)\s+invited you to\s+(.+)$/, actor: 1, action: 'invited you to', entity: 2 },
  // Deployment: "Deployment succeeded — project (env)"
  { pattern: /^(Deployment \w+)\s+[—–-]\s+(.+)$/, actor: 0, action: 'deployment', entity: 2 },
  // Sentry-style: "New issue: Error message"
  { pattern: /^New issue:\s+(.+)$/, actor: 0, action: 'new issue detected', entity: 1 },
  // "[Action Required] / [Alert] / etc.
  { pattern: /^\[(\w[\w\s]+)\]\s+(.+)$/, actor: 0, action: '', entity: 2 },
  // "Person replied to your comment"
  { pattern: /^(.+?)\s+replied to\s+(.+)$/, actor: 1, action: 'replied to', entity: 2 },
  // "Person reacted to your message"
  { pattern: /^(.+?)\s+reacted to\s+(.+)$/, actor: 1, action: 'reacted to', entity: 2 },
  // Phabricator: "[Differential] [Accepted] D1234: title"
  { pattern: /^\[Differential\]\s+\[(\w+)\]\s+(.+)$/, actor: 0, action: '', entity: 2 },
];

function extractNotificationMeta(
  subject: string,
  snippet: string,
  senderName: string,
  senderEmail: string,
): NotificationMeta {
  const domain = (senderEmail.split('@')[1] || '').toLowerCase();
  const serviceInfo = lookupService(domain);

  const service = serviceInfo?.name || domainToName(domain);
  const serviceColor = serviceInfo?.color || '#6b7280';
  const ctaLabel = serviceInfo?.ctaLabel || 'View';

  let actor = senderName || service;
  let action = '';
  let entity: string | undefined;

  // Try to parse structured info from subject
  for (const p of ACTOR_ACTION_PATTERNS) {
    const m = subject.match(p.pattern);
    if (m) {
      if (p.actor > 0 && m[p.actor]) actor = m[p.actor];
      action = p.action || m[1] || '';
      if (p.entity && m[p.entity]) entity = m[p.entity];
      break;
    }
  }

  // If no pattern matched, use subject as the action
  if (!action) {
    action = subject;
    actor = senderName || service;
  }

  // Use snippet as quote if it's different from the subject
  const quote = snippet && snippet !== subject && snippet.length > 10
    ? snippet.slice(0, 200)
    : undefined;

  return {
    kind: 'notification',
    service,
    serviceColor,
    actor,
    action,
    entity,
    quote,
    ctaLabel,
  };
}

// ── Transaction extraction ──

const AMOUNT_RE = /\$[\d,]+\.?\d{0,2}/;
const INVOICE_RE = /#?(?:INV|inv)[- ]?\d[\w-]*/;
const TRACKING_RE = /\b(?:1Z\w{16,}|\d{12,22})\b/;

type TxnType = 'payment' | 'shipping' | 'delivery' | 'security' | 'subscription' | 'ride';

interface TxnPattern {
  pattern: RegExp;
  type: TxnType;
  status: string;
  statusLabel: string;
  statusColor: string;
}

const TXN_PATTERNS: TxnPattern[] = [
  // Delivery
  { pattern: /\b(delivered|delivery confirm)/i, type: 'delivery', status: 'delivered', statusLabel: 'Delivered', statusColor: '#4caf50' },
  // Shipping
  { pattern: /\b(shipped|shipping (confirm|notif|update)|in transit|on its way|on the way)\b/i, type: 'shipping', status: 'shipped', statusLabel: 'In Transit', statusColor: '#4a9eff' },
  // Ride
  { pattern: /\b(trip with|ride receipt|ride summary|your .*(uber|lyft|ride))\b/i, type: 'ride', status: 'completed', statusLabel: 'Completed', statusColor: '#4caf50' },
  // Security
  { pattern: /\b(password reset|security alert|new sign[- ]?in|suspicious (activity|sign[- ]?in)|two[- ]?factor|2fa|verify your (email|account|identity))\b/i, type: 'security', status: 'action_required', statusLabel: 'Action Required', statusColor: '#ff8c42' },
  // Subscription
  { pattern: /\b(subscription (confirm|renew|cancel|update)|plan (renew|cancel|change)|membership (renew|confirm))\b/i, type: 'subscription', status: 'active', statusLabel: 'Active', statusColor: '#4a9eff' },
  // Payment (broad, keep last)
  { pattern: /\b(receipt|payment (received|confirm|processed|success)|invoice|order confirm|purchase confirm|charge|billing statement)\b/i, type: 'payment', status: 'paid', statusLabel: 'Paid', statusColor: '#4caf50' },
  // Order (also payment-like)
  { pattern: /\b(your order|order #?\d)/i, type: 'payment', status: 'confirmed', statusLabel: 'Confirmed', statusColor: '#4a9eff' },
  // Refund
  { pattern: /\brefund\b/i, type: 'payment', status: 'refunded', statusLabel: 'Refunded', statusColor: '#ff8c42' },
];

function extractTransactionMeta(
  subject: string,
  snippet: string,
  senderName: string,
): TransactionMeta {
  let type: TxnType = 'payment';
  let status = 'confirmed';
  let statusLabel = 'Confirmed';
  let statusColor = '#4a9eff';

  for (const p of TXN_PATTERNS) {
    if (p.pattern.test(subject) || p.pattern.test(snippet)) {
      type = p.type;
      status = p.status;
      statusLabel = p.statusLabel;
      statusColor = p.statusColor;
      break;
    }
  }

  // Extract amount from subject or snippet
  const amountMatch = subject.match(AMOUNT_RE) || snippet.match(AMOUNT_RE);
  const amount = amountMatch ? amountMatch[0] : undefined;

  // Merchant is sender name
  const merchant = senderName || undefined;

  // Build details
  const details: { label: string; value: string }[] = [];

  const invoiceMatch = subject.match(INVOICE_RE) || snippet.match(INVOICE_RE);
  if (invoiceMatch) details.push({ label: 'Invoice', value: invoiceMatch[0] });

  const trackingMatch = snippet.match(TRACKING_RE);
  if (trackingMatch) details.push({ label: 'Tracking', value: trackingMatch[0] });

  // CTA label based on type
  const ctaLabels: Record<TxnType, string> = {
    payment: 'View receipt',
    shipping: 'Track package',
    delivery: 'View details',
    security: 'Take action',
    subscription: 'Manage subscription',
    ride: 'View trip',
  };

  return {
    kind: 'transaction',
    type,
    status,
    statusLabel,
    statusColor,
    amount,
    merchant,
    details,
    ctaLabel: ctaLabels[type],
  };
}

// ── Helpers ──

/** Convert domain to human name: "notifications.github.com" → "GitHub" */
function domainToName(domain: string): string {
  // Strip common prefixes
  const clean = domain
    .replace(/^(notifications|mail|email|noreply|no-reply|alerts?|updates?)\./i, '')
    .replace(/\.(com|org|net|io|app|dev)$/i, '');
  // Title case
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// ── Public API ──

export function extractMeta(
  emailType: EmailType,
  subject: string,
  snippet: string,
  senderName: string,
  senderEmail: string,
): ThreadMeta | undefined {
  if (emailType === 'notification') {
    return extractNotificationMeta(subject, snippet, senderName, senderEmail);
  }
  if (emailType === 'transactional') {
    return extractTransactionMeta(subject, snippet, senderName);
  }
  return undefined;
}
