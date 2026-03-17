export type EmailType =
  | 'conversation'
  | 'newsletter'
  | 'notification'
  | 'transactional'
  | 'marketing'
  | 'calendar'
  | 'human-one-off';

export interface Account {
  id: string;
  name: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'other';
  color: string;
  unreadCount: number;
  avatarUrl?: string | null;
  aliases?: string[];
}

export interface Contact {
  name: string;
  email: string;
  avatar?: string;
}

export interface Message {
  id: string;
  threadId: string;
  headerMessageId?: string;
  from: Contact;
  to: Contact[];
  cc?: Contact[];
  subject: string;
  body: string;
  snippet: string;
  date: Date;
  unread: boolean;
  starred: boolean;
  draft: boolean;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  filename: string;
  size: number;
  contentType: string;
}

export type ThreadMeta =
  | {
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
  | {
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
    };

export interface Thread {
  id: string;
  accountId: string;
  subject: string;
  participants: Contact[];
  lastMessageDate: Date;
  snippet: string;
  unread: boolean;
  starred: boolean;
  pinned: boolean;
  messageCount: number;
  labels: string[];
  type: EmailType;
  messages: Message[];
  meta?: ThreadMeta;
}

export interface SidebarCategory {
  id: string;
  name: string;
  icon: string;
  unreadCount?: number;
  type: 'system' | 'label' | 'custom';
}

export type CategoryTab = 'all' | EmailType;
