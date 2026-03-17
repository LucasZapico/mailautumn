/**
 * Shared AI API calling layer — used by ai-classify.ts and ai-thread.ts.
 * Supports OpenAI-compatible (OpenAI, Open WebUI, Ollama) and Anthropic.
 */

import log from 'electron-log/main';

export type AIProvider = 'openai' | 'anthropic' | 'openwebui' | 'ollama';

export interface AISettings {
  enabled: boolean;
  provider: AIProvider;
  endpoint: string;
  apiKey: string;
  model: string;
}

interface CallOptions {
  systemPrompt: string;
  userPrompt: string;
  settings: AISettings;
  maxTokens?: number;
  temperature?: number;
  tag?: string; // log prefix
}

/** Convert raw API errors into user-friendly messages */
function friendlyError(status: number, body: string, settings: AISettings): string {
  const lower = body.toLowerCase();

  if (lower.includes('model not found') || lower.includes('model_not_found') || lower.includes('does not exist')) {
    return `Model "${settings.model}" not found. Check that this model is available on your ${settings.provider} instance.`;
  }
  if (status === 401 || lower.includes('unauthorized') || lower.includes('invalid.*key') || lower.includes('authentication')) {
    return `Authentication failed. Your API key may be invalid or expired. Check Settings \u2192 AI.`;
  }
  if (status === 403) {
    return `Access denied. Your API key may not have permission to use model "${settings.model}".`;
  }
  if (status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
    return `Rate limited. Too many requests \u2014 try again in a moment.`;
  }
  if (status === 500 || status === 502 || status === 503) {
    return `The AI server is temporarily unavailable (${status}). Try again shortly.`;
  }
  if (lower.includes('context length') || lower.includes('too long') || lower.includes('max.*tokens')) {
    return `The message was too long for this model. Try a shorter thread or a model with a larger context window.`;
  }
  if (lower.includes('econnrefused') || lower.includes('fetch failed') || lower.includes('enotfound')) {
    return `Could not reach "${settings.endpoint}". Check that the endpoint URL is correct and the server is running.`;
  }

  return `AI request failed (${status}). Check your settings in Settings \u2192 AI.`;
}

export async function callAI(opts: CallOptions): Promise<string> {
  const { settings, systemPrompt, userPrompt, maxTokens = 400, temperature = 0, tag = 'ai' } = opts;

  try {
    if (settings.provider === 'anthropic') {
      return await callAnthropic({ ...opts, maxTokens, temperature, tag });
    }
    return await callOpenAICompatible({ ...opts, maxTokens, temperature, tag });
  } catch (err: any) {
    const msg = err?.message || '';
    // Network-level errors (no HTTP response at all)
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT')) {
      throw new Error(`Could not reach "${settings.endpoint}". Check that the endpoint URL is correct and the server is running.`);
    }
    throw err;
  }
}

async function callOpenAICompatible(opts: CallOptions & { maxTokens: number; temperature: number; tag: string }): Promise<string> {
  const { settings, systemPrompt, userPrompt, maxTokens, temperature, tag } = opts;
  const base = settings.endpoint.replace(/\/+$/, '');
  let url: string;
  if (settings.provider === 'openwebui') {
    url = base + '/api/chat/completions';
  } else if (/\/v1(\/|$)/.test(base)) {
    url = base.replace(/\/v1\/?$/, '/v1/chat/completions');
  } else {
    url = base + '/v1/chat/completions';
  }
  log.info(`[${tag}] POST ${url} (provider: ${settings.provider})`);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      // OpenAI uses max_completion_tokens; Ollama/Open WebUI use max_tokens
      ...(settings.provider === 'openai'
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    log.error(`[${tag}] API error ${resp.status}: ${body.slice(0, 300)}`);
    throw new Error(friendlyError(resp.status, body, settings));
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(opts: CallOptions & { maxTokens: number; temperature: number; tag: string }): Promise<string> {
  const { settings, systemPrompt, userPrompt, maxTokens, tag } = opts;
  const base = settings.endpoint.replace(/\/+$/, '');
  const url = /\/v1(\/|$)/.test(base)
    ? base.replace(/\/v1\/?$/, '/v1/messages')
    : base + '/v1/messages';
  log.info(`[${tag}] POST ${url} (anthropic)`);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2024-10-22',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    log.error(`[${tag}] Anthropic API error ${resp.status}: ${body.slice(0, 300)}`);
    throw new Error(friendlyError(resp.status, body, settings));
  }

  const data = await resp.json();
  return data.content?.[0]?.text || '';
}
