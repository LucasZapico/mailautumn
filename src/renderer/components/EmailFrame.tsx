import { useRef, useEffect, useState, memo } from 'react';

/**
 * Renders email HTML in a sandboxed iframe with dark mode support.
 *
 * Dark mode strategy:
 * 1. Inject a dark override stylesheet AFTER the email's own styles (last = highest priority)
 * 2. Walk the DOM to strip inline color/background properties from elements
 * 3. Rewrite embedded <style> blocks to remove color declarations (preserve layout)
 * 4. Leave images alone — just slight brightness reduction
 */

const baseCSS = `
  html, body {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px; line-height: 1.5;
    overflow-x: hidden; word-wrap: break-word; overflow-wrap: break-word;
  }
  body { padding: 16px; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  pre { overflow-x: auto; max-width: 100%; }
`;

const lightCSS = `
  ${baseCSS}
  html, body { background: #fff; color: #1a1a1a; }
  a { color: #0066cc; }
`;

/**
 * Dark override — injected AFTER email styles AND after we strip competing
 * color declarations from <style> blocks and inline styles.
 * No !important needed: we remove the competition, then our rules win by order.
 */
const darkOverrideCSS = `
  html, body {
    background-color: #1e1e1e;
    color: #d8d8d8;
    color-scheme: dark;
  }
  /* High specificity selectors to beat any surviving class-based rules */
  html body, html body div, html body td, html body th,
  html body p, html body span, html body li, html body section,
  html body article, html body header, html body footer,
  html body h1, html body h2, html body h3, html body h4, html body h5, html body h6 {
    color: #d8d8d8;
  }
  html body h1, html body h2, html body h3, html body h4, html body strong, html body b {
    color: #f0f0f0;
  }
  html body table, html body tr, html body td, html body th,
  html body div, html body section, html body article {
    background-color: transparent;
  }
  html body a { color: #6ab0ff; }
  html body pre, html body code { background: #2a2a2a; color: #d4d4d4; }
  html body img { filter: brightness(0.9); }
  html body hr { border-color: #3a3a3a; }
`;

/** Color properties to strip from CSS declarations */
const COLOR_PROPS = new Set([
  'color', 'background-color', 'border-color',
  'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color',
  'outline-color',
]);

/**
 * Rewrite a <style> block: remove color-related declarations, keep layout.
 * Uses a simple property-level parser (no full CSS parser dependency).
 */
function rewriteStyleBlock(css: string): string {
  // Replace color-related property declarations within rule blocks
  return css.replace(
    /([{;])\s*([a-z-]+)\s*:\s*([^;{}]+)/gi,
    (match, prefix, prop, _value) => {
      const p = prop.trim().toLowerCase();
      // Remove color properties entirely
      if (COLOR_PROPS.has(p)) return prefix;
      // Remove background shorthand UNLESS it has url() (preserve bg images)
      if (p === 'background' && !_value.includes('url(')) return prefix;
      return match;
    }
  );
}

/**
 * DOM walk: strip inline style color properties and HTML color attributes.
 * After this, only our override stylesheet controls colors.
 */
function stripInlineColors(doc: Document) {
  for (const el of doc.body.querySelectorAll('*')) {
    const s = (el as HTMLElement).style;
    if (!s) continue;

    if (s.color) s.color = '';
    if (s.backgroundColor) s.backgroundColor = '';
    if (s.background && !s.background.includes('url(')) s.background = '';
    if (s.backgroundImage && !s.backgroundImage.includes('url(')) s.backgroundImage = '';
    if (s.borderColor) s.borderColor = '';
    if (s.borderTopColor) s.borderTopColor = '';
    if (s.borderBottomColor) s.borderBottomColor = '';
    if (s.borderLeftColor) s.borderLeftColor = '';
    if (s.borderRightColor) s.borderRightColor = '';
  }

  // HTML attributes
  for (const el of doc.body.querySelectorAll('[bgcolor]')) el.removeAttribute('bgcolor');
  for (const el of doc.body.querySelectorAll('[color]')) el.removeAttribute('color');

  // Rewrite embedded <style> blocks — strip color properties, keep layout
  for (const style of doc.querySelectorAll('style')) {
    style.textContent = rewriteStyleBlock(style.textContent || '');
  }

  // Inject our dark override LAST so it wins
  const override = doc.createElement('style');
  override.textContent = darkOverrideCSS;
  doc.head.appendChild(override);
}

export default memo(function EmailFrame({ html, dark = false, className = '' }: {
  html: string;
  dark?: boolean;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' data: blob: mailspring-file:; img-src * data: blob: mailspring-file:;">
${dark ? '<meta name="color-scheme" content="dark">' : ''}
<style>${baseCSS}</style>
${!dark ? `<style>${lightCSS}</style>` : ''}
</head>
<body>${html}</body>
</html>`);
    doc.close();

    // In dark mode, rewrite styles and strip inline colors
    if (dark) {
      stripInlineColors(doc);
    }

    // Resize iframe to fit content
    const resize = () => {
      if (doc.body) {
        const h = doc.body.scrollHeight;
        if (h > 0) setHeight(h);
      }
    };

    const observer = new ResizeObserver(resize);
    if (doc.body) observer.observe(doc.body);

    resize();
    requestAnimationFrame(resize);
    const t1 = setTimeout(resize, 200);
    const t2 = setTimeout(resize, 1000);

    // Resize when images load
    for (const img of Array.from(doc.querySelectorAll('img'))) {
      if (!img.complete) {
        img.addEventListener('load', resize);
        img.addEventListener('error', resize);
      }
    }

    // Open links in system browser
    doc.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest('a');
      if (link?.href && !link.href.startsWith('javascript:')) {
        e.preventDefault();
        window.open(link.href, '_blank');
      }
    });

    return () => {
      observer.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [html, dark]);

  return (
    <iframe
      ref={iframeRef}
      className={`w-full border-0 rounded-lg ${className}`}
      style={{ height, minHeight: 100 }}
      sandbox="allow-same-origin allow-popups"
      referrerPolicy="no-referrer"
      title="Email content"
    />
  );
})
