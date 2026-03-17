import { marked } from 'marked';

// Configure marked for email-safe HTML
marked.setOptions({
  gfm: true,
  breaks: true, // single newlines become <br>
});

/** Convert markdown text to email-safe HTML */
export function markdownToHtml(text: string): string {
  const raw = marked.parse(text, { async: false }) as string;
  // Wrap in a basic div so email clients handle it properly
  return raw.trim();
}

/** Insert markdown syntax around selection or at cursor in a textarea */
export function insertMarkdown(
  textarea: HTMLTextAreaElement,
  syntax: 'bold' | 'italic' | 'code' | 'codeblock' | 'link' | 'heading' | 'ul' | 'ol' | 'quote' | 'hr',
): string {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.slice(start, end);
  let before = '';
  let after = '';
  let replacement = '';
  let cursorOffset = 0;

  switch (syntax) {
    case 'bold':
      before = '**';
      after = '**';
      replacement = selected || 'bold text';
      cursorOffset = selected ? 0 : -before.length - after.length;
      break;
    case 'italic':
      before = '_';
      after = '_';
      replacement = selected || 'italic text';
      cursorOffset = selected ? 0 : -before.length - after.length;
      break;
    case 'code':
      if (selected.includes('\n')) {
        before = '```\n';
        after = '\n```';
        replacement = selected;
      } else {
        before = '`';
        after = '`';
        replacement = selected || 'code';
      }
      cursorOffset = selected ? 0 : -after.length;
      break;
    case 'codeblock':
      before = '```\n';
      after = '\n```';
      replacement = selected || 'code';
      cursorOffset = selected ? 0 : -after.length;
      break;
    case 'link':
      if (selected) {
        before = '[';
        after = '](url)';
        replacement = selected;
      } else {
        before = '[';
        after = '](url)';
        replacement = 'link text';
      }
      cursorOffset = selected ? 0 : -after.length;
      break;
    case 'heading':
      before = '## ';
      replacement = selected || 'Heading';
      cursorOffset = selected ? 0 : 0;
      break;
    case 'ul': {
      const lines = (selected || 'Item').split('\n');
      replacement = lines.map(l => `- ${l}`).join('\n');
      break;
    }
    case 'ol': {
      const lines2 = (selected || 'Item').split('\n');
      replacement = lines2.map((l, i) => `${i + 1}. ${l}`).join('\n');
      break;
    }
    case 'quote': {
      const qlines = (selected || 'Quote').split('\n');
      replacement = qlines.map(l => `> ${l}`).join('\n');
      break;
    }
    case 'hr':
      replacement = '\n---\n';
      break;
  }

  const newText = text.slice(0, start) + before + replacement + after + text.slice(end);
  const newCursor = start + before.length + replacement.length + (cursorOffset || 0);

  // We return the new text — the caller sets it and restores focus/cursor
  // Also schedule cursor position restore
  requestAnimationFrame(() => {
    textarea.selectionStart = textarea.selectionEnd = newCursor;
    textarea.focus();
  });

  return newText;
}
