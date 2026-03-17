import { useRef, useEffect, useState, memo } from 'react';

/**
 * Renders email HTML in a sandboxed iframe.
 *
 * Dark mode approach (inspired by Dark Reader's "Dynamic" strategy):
 * 1. Set `color-scheme: dark` so the browser knows the intent.
 * 2. Use broad attribute selectors (`[style*="background"]`, `[style*="color"]`)
 *    with `!important` to override ALL inline styles — no hex-guessing.
 * 3. Walk the DOM post-write to strip inline `color` and `background` properties
 *    from individual elements, letting our stylesheet take over.
 * 4. Leave images alone (no invert) — just slight brightness reduction.
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

const darkCSS = `
  ${baseCSS}
  html, body {
    background: #1e1e1e !important; color: #e0e0e0 !important;
    color-scheme: dark;
  }
  a { color: #6ab0ff !important; }
  pre, code { background: #2a2a2a !important; color: #d4d4d4 !important; }
  img { filter: brightness(0.9); }

  /*
   * Nuclear dark mode: override ALL elements, not just those with inline styles.
   * Newsletter HTML uses <style> blocks and classes — attribute selectors miss those.
   */

  /* Force dark backgrounds on everything */
  * {
    background-color: transparent !important;
    border-color: #3a3a3a !important;
  }
  html, body {
    background-color: #1e1e1e !important;
  }
  /* Tables are the backbone of newsletter layouts — they need explicit bg */
  table, tr, td, th, div, section, article, header, footer, main, aside, nav {
    background-color: transparent !important;
  }
  /* Give depth to layout containers that had backgrounds */
  table[style*="background"], td[style*="background"],
  div[style*="background"], [bgcolor],
  table[class], td[class], div[class] {
    background-color: #1e1e1e !important;
  }

  /* Force all text to light colors */
  * {
    color: #d8d8d8 !important;
  }
  h1, h2, h3, h4, h5, h6, strong, b {
    color: #f0f0f0 !important;
  }
  /* Muted text */
  small, .footer, [style*="font-size: 1"], [style*="font-size:1"] {
    color: #999 !important;
  }

  /* Strip gradients */
  [style*="linear-gradient"], [style*="radial-gradient"] {
    background-image: none !important;
  }

  /* Buttons — keep them visible */
  a[style*="background"], a[class] {
    background-color: #333 !important;
    color: #6ab0ff !important;
  }

  /* Box shadows — tone down */
  [style*="box-shadow"] {
    box-shadow: 0 1px 3px rgba(0,0,0,0.4) !important;
  }

  /* Outlook conditional blocks */
  .ExternalClass, .ReadMsgBody {
    background-color: #1e1e1e !important;
    color: #e0e0e0 !important;
  }
`;

/**
 * Post-render DOM walk: strip inline color/background properties so our
 * stylesheet !important rules take full effect. Some email generators
 * set styles via both `style=""` attribute AND CSS classes; this ensures
 * inline wins don't fight our overrides.
 */
/** Check if a color string is "light" (would be invisible on dark bg) */
function isLightColor(color: string): boolean {
  if (!color || color === 'transparent' || color === 'inherit' || color === 'initial') return false;
  // Parse rgb/rgba
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) {
    const [, r, g, b] = m.map(Number);
    // Luminance threshold — anything above ~180 is "light"
    return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
  }
  return false;
}

function stripInlineColors(doc: Document) {
  const elements = doc.body.querySelectorAll('*');

  for (const el of elements) {
    const htmlEl = el as HTMLElement;
    const s = htmlEl.style;
    if (!s) continue;

    // Strip ALL inline color properties — our CSS !important rules take over
    if (s.color) s.color = '';
    if (s.backgroundColor) s.backgroundColor = '';
    if (s.background) {
      if (!s.background.includes('url(')) s.background = '';
    }
    if (s.backgroundImage && !s.backgroundImage.includes('url(')) {
      s.backgroundImage = '';
    }
    if (s.borderColor) s.borderColor = '';
    if (s.borderTopColor) s.borderTopColor = '';
    if (s.borderBottomColor) s.borderBottomColor = '';
    if (s.borderLeftColor) s.borderLeftColor = '';
    if (s.borderRightColor) s.borderRightColor = '';
  }

  // Strip bgcolor HTML attributes
  for (const el of doc.body.querySelectorAll('[bgcolor]')) {
    el.removeAttribute('bgcolor');
  }

  // Strip color HTML attributes
  for (const el of doc.body.querySelectorAll('[color]')) {
    el.removeAttribute('color');
  }

  // Remove all embedded <style> blocks — their class-based color/background
  // declarations fight our !important dark overrides. Layout (widths, padding,
  // fonts) may shift slightly, but dark mode readability wins.
  for (const style of doc.querySelectorAll('style')) {
    style.remove();
  }
}

export default memo(function EmailFrame({ html, dark = false, className = '' }: { html: string; dark?: boolean; className?: string }) {
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
<style>${dark ? darkCSS : lightCSS}</style>
</head>
<body>${html}</body>
</html>`);
    doc.close();

    // In dark mode, walk the DOM and strip inline colors so our CSS takes over
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

    // Resize when images load (they change content height)
    const images = doc.querySelectorAll('img');
    for (const img of Array.from(images)) {
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
