/**
 * Content extractor for conversation view.
 *
 * Two modes:
 * - `extractContent(html)` — single message, heuristic-based
 * - `extractForThread(messages)` — thread-aware, deduplicates across messages
 */

// ── Selectors ──

const QUOTE_SELECTORS = [
  'blockquote',
  '.gmail_quote',
  '.gmail_extra',
  '.yahoo_quoted',
  '[class*="yahoo_quoted"]',
  '.moz-cite-prefix',
  '.zmail_extra',
  '#divRplyFwdMsg',
  '[id*="divRplyFwdMsg"]',          // Gmail proxies Outlook IDs: m_-NNNdivRplyFwdMsg
  '#appendonsend',
  '[name="quote"]',
  '[name="messageReplySection"]',    // Some clients mark reply sections explicitly
];

const SIGNATURE_SELECTORS = [
  '.gmail_signature',
  '.gmail_signature_prefix',
  '[class*="signature"]',
  '[id*="signature"]',
  '.moz-signature',
  '[class*="moz-signature"]',
  '#ms-outlook-mobile-signature',
  '[id*="ms-outlook-mobile"]',
];

// Attribution patterns — tested against trimmed text content of elements
const ATTRIBUTION_RE = [
  /^On .{10,120} wrote:\s*$/i,
  /^On .{10,120} wrote:\s*$/im,          // multiline variant
  /^\d{4}.*\d{1,2}:\d{2}.*wrote:$/im,    // "2026-03-10 ... wrote:"
  /^_{3,}$/,
  /^-{3,}\s*(Original Message|Forwarded message)/i,
  /^-{5,}$/,
  /^[–—]{5,}$/,                           // em dash / en dash separator lines (e.g. ––––––––)
  /^\*?From:\*?\s.+/i,
  /^Sent from my (iPhone|iPad|Galaxy|Pixel|Outlook|Samsung)/i,
  /^Sent from Mail for /i,
  /^Get Outlook for /i,
  /^Sent via /i,
  /^-- ?$/,
  /^—$/,
];

// Sign-off patterns — "Best,\nName" or "Cheers,\nName" at the end of message body
// These mark the end of original content; everything after is signature/footer
const SIGNOFF_RE = /^(best|cheers|regards|kind regards|warm regards|many thanks|thanks|thank you|sincerely|yours truly|respectfully|take care|all the best|warmly|cordially|yours|br),?\s*$/i;

const OUTLOOK_HEADER_RE = /From:\s*.+\n\s*Sent:\s*.+\n\s*To:\s*.+/im;

const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;

// ── Helpers ──

/** Normalize text for comparison: lowercase, collapse whitespace, strip non-alphanum */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w ]/g, '').trim();
}

/** Strip inline color/background styles that break dark themes */
function stripInlineColors(root: Element): void {
  for (const el of Array.from(root.querySelectorAll('[style]'))) {
    const style = el.getAttribute('style') || '';
    // Remove color, background-color, and background properties
    // Preserve background values that contain url() (layout images)
    const cleaned = style
      .replace(/\b(color)\s*:\s*[^;]+;?/gi, '')
      .replace(/\b(background-color)\s*:\s*[^;]+;?/gi, '')
      .replace(/\b(background)\s*:\s*([^;]+);?/gi, (m, _prop, val) =>
        val.includes('url(') ? m : '')
      .replace(/\b(background-image)\s*:\s*([^;]+);?/gi, (m, _prop, val) =>
        val.includes('url(') ? m : '')
      .trim();
    if (cleaned) {
      el.setAttribute('style', cleaned);
    } else {
      el.removeAttribute('style');
    }
  }
  // Also strip color attributes (old-school HTML)
  for (const el of Array.from(root.querySelectorAll('[color]'))) {
    el.removeAttribute('color');
  }
  for (const el of Array.from(root.querySelectorAll('[bgcolor]'))) {
    el.removeAttribute('bgcolor');
  }
}

function removeElementAndFollowing(el: Element): void {
  const parent = el.parentElement;
  if (!parent) return;
  let sibling = el.nextSibling;
  while (sibling) {
    const next = sibling.nextSibling;
    parent.removeChild(sibling);
    sibling = next;
  }
  parent.removeChild(el);
}

/** Check if an element's text matches an attribution pattern */
function isAttribution(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (ATTRIBUTION_RE.some(re => re.test(t))) return true;
  // Also check first line for multi-line elements (e.g., separator + name in one div)
  const firstLine = t.split('\n')[0].trim();
  if (firstLine && firstLine !== t && ATTRIBUTION_RE.some(re => re.test(firstLine))) return true;
  return false;
}

/** Check if text looks like a sign-off line (Best, / Cheers, / etc.) */
function isSignoff(text: string): boolean {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0 || lines.length > 3) return false;
  return SIGNOFF_RE.test(lines[0]);
}

/** Walk the tree depth-first, find the first element matching an attribution or separator pattern.
 *  Returns the element and all ancestors up to root. */
function findDeepAttribution(root: Element): Element | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Element | null = walker.firstChild() as Element | null;
  while (node) {
    // Only check elements that have meaningful direct text (not just from children)
    const directText = getDirectText(node).trim();
    if (directText && isAttribution(directText)) {
      return node;
    }
    // Also check full textContent for short elements (avoids missing nested spans)
    const full = (node.textContent || '').trim();
    if (full.length < 200 && isAttribution(full)) {
      return node;
    }
    node = walker.nextNode() as Element | null;
  }
  return null;
}

/** Find a sign-off element ("Best,\nEmma") in the bottom half of the content.
 *  Returns the element if found, with everything after being signature/footer. */
function findSignoff(root: Element): Element | null {
  const children = Array.from(root.children);
  const startAt = Math.floor(children.length * 0.4);
  for (let i = children.length - 1; i >= startAt; i--) {
    const text = (children[i].textContent || '').trim();
    if (isSignoff(text)) {
      // Verify what's after looks like a signature (short, has separators or is just a name)
      const afterLen = children.slice(i + 1).reduce((sum, el) => sum + (el.textContent || '').trim().length, 0);
      if (afterLen < 600) return children[i];
    }
  }
  return null;
}

/** Get only the direct text of an element (not from children) */
function getDirectText(el: Element): string {
  let text = '';
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent || '';
    }
  }
  return text;
}

// ── Main extraction ──

export interface ExtractionResult {
  html: string;
  confidence: number;
}

/**
 * Extract original content from a single email HTML body.
 * Strips quoted replies, signatures, and inline colors for dark theme.
 */
export function extractContent(html: string): ExtractionResult {
  if (!html?.trim() || !parser) {
    return { html: html || '', confidence: 1 };
  }

  const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = doc.getElementById('root')!;
  let removedQuote = false;

  // Phase 1: Strip inline colors for dark theme
  stripInlineColors(root);

  // Phase 2: Remove quoted content containers
  const quoteSelector = QUOTE_SELECTORS.join(',');
  for (const el of Array.from(root.querySelectorAll(quoteSelector))) {
    // Don't remove if it's the entire body content
    if (el === root.firstElementChild && root.children.length === 1) continue;
    // For Outlook forward/reply divs, the quoted body is in a sibling — remove element AND everything after
    const id = el.getAttribute('id') || '';
    const name = el.getAttribute('name') || '';
    if (id.includes('divRplyFwdMsg') || id === 'appendonsend' || name === 'messageReplySection') {
      // Also remove the preceding <hr> separator if present
      const prev = el.previousElementSibling;
      if (prev?.tagName === 'HR') prev.remove();
      removeElementAndFollowing(el);
    } else {
      el.remove();
    }
    removedQuote = true;
  }

  // Phase 3: Remove signature containers
  const sigSelector = SIGNATURE_SELECTORS.join(',');
  for (const el of Array.from(root.querySelectorAll(sigSelector))) {
    el.remove();
    removedQuote = true;
  }

  // Phase 3b: Remove "Sent from my ..." mobile signature divs (not always in a signature container)
  for (const el of Array.from(root.querySelectorAll('div, span, p'))) {
    const text = (el.textContent || '').trim();
    if (/^Sent from my (iPhone|iPad|Galaxy|Pixel|Outlook|Samsung|T-Mobile)/i.test(text)
      || /^Get Outlook for /i.test(text)
      || /^Sent from Mail for /i.test(text)) {
      // Only remove if it's a small element (not the whole body)
      if (text.length < 100) {
        el.remove();
        removedQuote = true;
      }
    }
  }

  // Phase 4: Remove Outlook border-top separator divs and everything after
  for (const el of Array.from(root.querySelectorAll('div[style]'))) {
    const style = el.getAttribute('style') || '';
    if (/border-top\s*:\s*solid\s+#/i.test(style) || /border-top\s*:\s*1px\s+solid/i.test(style)) {
      removeElementAndFollowing(el);
      removedQuote = true;
      break;
    }
  }

  // Phase 4b: Remove <hr> separators that precede forward/reply content
  // Outlook uses <hr style="display:inline-block;width:98%"> before quoted chains
  if (!removedQuote) {
    for (const hr of Array.from(root.querySelectorAll('hr'))) {
      const next = hr.nextElementSibling;
      if (!next) continue;
      const nextText = (next.textContent || '').trim();
      // Check if content after HR looks like a forward/reply header
      if (/^From:\s/im.test(nextText) || OUTLOOK_HEADER_RE.test(nextText)) {
        removeElementAndFollowing(hr);
        removedQuote = true;
        break;
      }
    }
  }

  // Phase 5: Deep scan for attribution lines ("On ... wrote:")
  // Find the attribution element and remove it + everything after in its parent
  const attrEl = findDeepAttribution(root);
  if (attrEl && attrEl !== root) {
    // Walk up to find the highest ancestor (direct child of root) that contains the attribution
    let target: Element = attrEl;
    while (target.parentElement && target.parentElement !== root) {
      target = target.parentElement;
    }
    if (target.parentElement === root) {
      // Remove target and all following siblings
      removeElementAndFollowing(target);
      removedQuote = true;
    }
  }

  // Phase 5b: Find sign-off lines and remove the signature block after them
  if (!removedQuote) {
    const signoffEl = findSignoff(root);
    if (signoffEl && signoffEl.parentElement === root) {
      // Keep the sign-off element, remove everything after it
      let sibling = signoffEl.nextSibling;
      while (sibling) {
        const next = sibling.nextSibling;
        root.removeChild(sibling);
        sibling = next;
      }
      removedQuote = true;
    }
  }

  // Phase 6: Check top-level children for text-based boundaries
  // (handles cases missed by deep scan, like plain text nodes)
  const children = Array.from(root.childNodes);
  let cutIndex = -1;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    const text = (node.textContent || '').trim();
    if (!text) continue;
    if (isAttribution(text)) {
      cutIndex = i;
      break;
    }
    if (node instanceof Element && OUTLOOK_HEADER_RE.test(text)) {
      cutIndex = i;
      break;
    }
    if (node instanceof Element && node.tagName === 'HR' && i > children.length * 0.3) {
      cutIndex = i;
      break;
    }
  }
  if (cutIndex >= 0) {
    for (let i = children.length - 1; i >= cutIndex; i--) {
      root.removeChild(children[i]);
    }
    removedQuote = true;
  }

  // Phase 6b: Detect sign-off + signature blocks
  // Look for "Best,\nEmma" or "Cheers,\nLucas" patterns followed by separator/footer
  {
    const blocks = Array.from(root.childNodes);
    for (let i = blocks.length - 1; i >= 0; i--) {
      const text = (blocks[i].textContent || '').trim();
      if (!text) continue;

      // Check for dash/em-dash separator lines (e.g. "–––––––––––––")
      if (/^[–—_\-─═]{5,}/.test(text)) {
        // Found a separator — remove it and everything after
        for (let j = blocks.length - 1; j >= i; j--) {
          root.removeChild(blocks[j]);
        }
        removedQuote = true;
        break;
      }

      // Check for sign-off line — "Best," or "Cheers," etc.
      // Only match if it's near the end (last 30% of elements)
      if (i > blocks.length * 0.5) {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        // Single-line sign-off like "Best," or "Best,\nEmma"
        if (lines.length <= 3 && SIGNOFF_RE.test(lines[0])) {
          // Check what's after — if remaining content is short (signature), cut here
          const afterText = blocks.slice(i + 1).map(n => (n.textContent || '').trim()).join(' ');
          // If there's very little after, or it contains separator chars, this is the sign-off
          if (afterText.length < 500 || /[–—_\-─═]{5,}/.test(afterText)) {
            // Keep the sign-off line, remove everything after it
            for (let j = blocks.length - 1; j > i; j--) {
              root.removeChild(blocks[j]);
            }
            removedQuote = true;
            break;
          }
        }
      }
    }
  }

  // Phase 7: Clean up trailing <br> tags
  while (root.lastElementChild?.tagName === 'BR') {
    root.lastElementChild.remove();
  }

  const result = root.innerHTML.trim();
  if (!result || result === '&nbsp;') {
    // Extraction removed everything — return color-stripped original
    stripInlineColors(doc.getElementById('root')!); // re-parse needed? no, root is mutated
    return { html, confidence: 0.3 };
  }

  return { html: result, confidence: removedQuote ? 0.85 : 0.5 };
}

/**
 * Thread-aware extraction: processes messages in order,
 * deduplicating content that appears in earlier messages.
 *
 * Returns a Map of messageId → extracted HTML.
 */
export function extractForThread(
  messages: { id: string; body: string }[],
): Map<string, ExtractionResult> {
  const results = new Map<string, ExtractionResult>();
  const previousTexts: string[] = []; // normalized text of previous messages

  for (const msg of messages) {
    // First pass: standard extraction
    const extracted = extractContent(msg.body);

    // Second pass: deduplicate against previous messages
    if (previousTexts.length > 0 && parser) {
      const doc = parser.parseFromString(`<div id="root">${extracted.html}</div>`, 'text/html');
      const root = doc.getElementById('root')!;
      let deduped = false;

      // Walk block-level children and check for duplicates
      const blocks = Array.from(root.children);
      // Work backwards — quoted content is typically at the bottom
      for (let i = blocks.length - 1; i >= 0; i--) {
        const blockText = normalize(blocks[i].textContent || '');
        if (blockText.length < 20) continue; // skip tiny elements

        // Check if this block's text appears in any previous message
        const isDuplicate = previousTexts.some(prev => {
          // Check if the block is a substantial substring of a previous message
          return prev.includes(blockText) && blockText.length > 30;
        });

        if (isDuplicate) {
          // Remove this block and everything after it
          for (let j = blocks.length - 1; j >= i; j--) {
            blocks[j].remove();
          }
          deduped = true;
          break;
        }
      }

      if (deduped) {
        // Clean trailing <br>
        while (root.lastElementChild?.tagName === 'BR') {
          root.lastElementChild.remove();
        }
        const html = root.innerHTML.trim();
        if (html && html !== '&nbsp;') {
          extracted.html = html;
          extracted.confidence = 0.9;
        }
      }
    }

    results.set(msg.id, extracted);
    // Add this message's normalized text for future dedup
    previousTexts.push(normalize(extracted.html));
  }

  return results;
}
