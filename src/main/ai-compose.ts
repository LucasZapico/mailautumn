/**
 * AI-powered compose assistance — runs in main process.
 * Generates draft replies or helps write new emails using thread context.
 * Uses the shared callAI layer (OpenAI-compatible + Anthropic).
 */

import log from 'electron-log/main';
import { callAI } from './ai-api';
import type { AISettings } from './ai-api';

// ── Types ──

export type ComposeTone = 'professional' | 'casual' | 'friendly' | 'formal' | 'concise';

export interface ComposeAIRequest {
  /** 'reply' uses thread context, 'new' writes from scratch, 'rewrite' rewrites existing body */
  mode: 'reply' | 'new' | 'rewrite';
  /** Thread messages for context (reply mode) */
  threadMessages?: { from: string; date: string; body: string }[];
  /** Subject line */
  subject?: string;
  /** Recipients */
  to?: string[];
  /** User's existing draft body (for rewrite mode) */
  existingBody?: string;
  /** Optional user instruction: "decline politely", "ask for more details", etc. */
  instruction?: string;
  /** Tone */
  tone?: ComposeTone;
  /** Sender name for sign-off */
  senderName?: string;
}

// ── Prompts ──

function buildSystemPrompt(req: ComposeAIRequest): string {
  const toneGuide: Record<ComposeTone, string> = {
    professional: 'Use a professional, clear, and polite tone.',
    casual: 'Use a casual, conversational tone. Keep it relaxed.',
    friendly: 'Use a warm, friendly tone. Be personable.',
    formal: 'Use a formal, respectful tone. Be precise.',
    concise: 'Be extremely concise. Short sentences, no fluff.',
  };

  const tone = toneGuide[req.tone || 'professional'];

  if (req.mode === 'rewrite') {
    return `You rewrite email drafts. Improve the writing while keeping the same meaning.
${tone}
${req.instruction ? `Instruction: ${req.instruction}` : ''}

CRITICAL RULES:
- Output ONLY the rewritten email body. No preamble, no explanation before or after
- NEVER use placeholder text like "[topic]" or "[details]" — use the actual content from the draft
- Preserve the core message, intent, and any specific details
- Keep greetings only if the original had them
- Do not add a signature
- Keep it natural and human-sounding`;
  }

  if (req.mode === 'reply') {
    return `You draft email replies. Read the thread carefully and write a specific, contextual reply.
${tone}
${req.instruction ? `Instruction: ${req.instruction}` : ''}
${req.subject ? `Subject: ${req.subject}` : ''}

CRITICAL RULES:
- Output ONLY the email body. No preamble, no "Here's a draft:", no explanation before or after
- NEVER use placeholder text like "[topic]", "[details]", or "[your name]" — write real content based on the thread
- Reference specific details from the conversation — names, topics, dates mentioned
- Address the recipient by name if known from the thread
- Sign off with: "${req.senderName?.split(' ')[0] || ''}"
- Do not include subject lines, quoted text, or "Re:"
- Do not quote or repeat the original messages
- Keep it natural and human-sounding`;
  }

  // mode === 'new'
  return `You write emails. Write a complete, specific email based on the instructions given.
${tone}
${req.instruction ? `Instruction: ${req.instruction}` : ''}

CRITICAL RULES:
- Output ONLY the email body. No preamble, no explanation before or after
- NEVER use placeholder text like "[topic]", "[details]", or "[your name]" — write real, specific content
- Sign off with: "${req.senderName?.split(' ')[0] || ''}"
- Do not include subject lines or metadata
- Keep it natural and human-sounding
- Be concise unless the topic requires detail`;
}

function buildUserPrompt(req: ComposeAIRequest): string {
  if (req.mode === 'rewrite') {
    return `Rewrite this email draft:\n\n${req.existingBody}`;
  }

  if (req.mode === 'reply') {
    const thread = (req.threadMessages || [])
      .map((m, i) => `[${i + 1}] From: ${m.from} | ${m.date}\n${m.body}`)
      .join('\n\n');

    let prompt = `Email thread to reply to:\n\n${thread}`;
    prompt += `\n\nYou are replying as: ${req.senderName || 'the user'}`;
    if (req.to?.length) prompt += `\nReplying to: ${req.to.join(', ')}`;
    if (req.instruction) {
      prompt += `\n\nWrite a reply that: ${req.instruction}`;
    } else {
      prompt += '\n\nWrite a contextual reply to the most recent message.';
    }
    return prompt;
  }

  // mode === 'new'
  let prompt = '';
  if (req.subject) prompt += `Subject: ${req.subject}\n`;
  if (req.to?.length) prompt += `To: ${req.to.join(', ')}\n`;
  if (req.instruction) {
    prompt += `\nWrite an email that: ${req.instruction}`;
  } else {
    prompt += '\nWrite this email.';
  }
  return prompt;
}

// ── Post-processing ──

/** Strip conversational preamble some models add despite instructions */
function stripPreamble(text: string): string {
  // Remove leading lines that are AI commentary, not email content
  // Matches: "Certainly.", "Sure!", "Here's a draft:", "Here is your reply:", etc.
  let cleaned = text.replace(/^(?:(?:certainly|sure|absolutely|of course)[.!,]?\s*)/i, '').trim();
  cleaned = cleaned.replace(/^(?:here(?:'s| is) (?:a |the |your |my )?(?:draft|response|reply|rewrite|email|version)[^:\n]*:)\s*/i, '').trim();
  // Remove "I'd be happy to help..." style openers
  cleaned = cleaned.replace(/^(?:i'?d be happy to|i'?ll|let me)[^.\n]*\.\s*/i, '').trim();
  return cleaned;
}

// ── Public API ──

export async function generateDraft(
  req: ComposeAIRequest,
  aiSettings: AISettings,
): Promise<{ success: true; body: string } | { success: false; error: string }> {
  if (!aiSettings.enabled || !aiSettings.endpoint || !aiSettings.apiKey) {
    return { success: false, error: 'AI is not configured. Enable it in Settings → AI.' };
  }

  try {
    const systemPrompt = buildSystemPrompt(req);
    const userPrompt = buildUserPrompt(req);

    log.info(`[ai-compose] generating ${req.mode} draft (tone: ${req.tone || 'professional'})`);

    const body = await callAI({
      systemPrompt,
      userPrompt,
      settings: aiSettings,
      maxTokens: 1000,
      temperature: 0.7,
      tag: 'ai-compose',
    });

    if (!body.trim()) {
      return { success: false, error: 'AI returned empty response' };
    }

    const cleaned = stripPreamble(body);
    log.info(`[ai-compose] generated ${cleaned.length} chars`);
    return { success: true, body: cleaned };
  } catch (err: any) {
    log.error('[ai-compose] generation failed:', err);
    return { success: false, error: err.message || 'AI generation failed' };
  }
}
