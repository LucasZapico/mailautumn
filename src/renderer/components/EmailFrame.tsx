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
    background: #1e1e1e; color: #e0e0e0;
    color-scheme: dark;
  }
  a { color: #6ab0ff !important; }
  pre { background: #2a2a2a !important; color: #d4d4d4 !important; }
  img { filter: brightness(0.9); }

  /*
   * Dark Reader-style: override ALL elements with inline style attributes
   * containing color/background keywords. This is far more robust than
   * trying to match specific hex values.
   */

  /* Background overrides — any element with an inline background */
  [style*="background-color"], [style*="background:"],
  [bgcolor] {
    background-color: #1e1e1e !important;
  }
  /* Slightly lighter for nested containers (cards, panels) */
  [style*="background-color"] [style*="background-color"],
  [style*="background:"] [style*="background:"],
  table[style*="background"] td[style*="background"],
  [bgcolor] [bgcolor] {
    background-color: #252525 !important;
  }
  /* Third level — subtle differentiation */
  [style*="background-color"] [style*="background-color"] [style*="background-color"],
  td[style*="background"] td[style*="background"] {
    background-color: #2a2a2a !important;
  }

  /* Text color overrides — any element with an inline color */
  [style*="color:"], [style*="color :"] {
    color: #e0e0e0 !important;
  }
  /* Preserve intentionally muted/secondary text by keeping it slightly dimmer */
  h1, h2, h3, h4, h5, h6, strong, b {
    color: #f0f0f0 !important;
  }

  /* Border overrides */
  [style*="border"], hr {
    border-color: #3a3a3a !important;
  }

  /* Common email bgcolor attributes */
  body[bgcolor], table[bgcolor], td[bgcolor], tr[bgcolor], th[bgcolor] {
    background-color: #1e1e1e !important;
  }

  /* Gradient overlays — strip them */
  [style*="linear-gradient"], [style*="radial-gradient"] {
    background-image: none !important;
    background-color: #252525 !important;
  }

  /* Box shadows — tone down */
  [style*="box-shadow"] {
    box-shadow: 0 1px 3px rgba(0,0,0,0.4) !important;
  }

  /* Outlook-style MSO conditional blocks */
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
function stripInlineColors(doc: Document) {
  const elements = doc.body.querySelectorAll('*');
  for (const el of elements) {
    const s = (el as HTMLElement).style;
    if (!s) continue;

    // Strip inline colors — let our stylesheet handle it
    if (s.color) s.color = '';
    if (s.backgroundColor) s.backgroundColor = '';
    if (s.background) {
      // Preserve background-image (for layouts) but strip color component
      const bg = s.background;
      if (!bg.includes('url(')) {
        s.background = '';
      }
    }
    // Preserve background-image separately (set via longhand, not shorthand)
    if (s.backgroundImage && !s.backgroundImage.includes('url(')) {
      s.backgroundImage = '';
    }

    // Strip inline border colors
    if (s.borderColor) s.borderColor = '';
    if (s.borderTopColor) s.borderTopColor = '';
    if (s.borderBottomColor) s.borderBottomColor = '';
    if (s.borderLeftColor) s.borderLeftColor = '';
    if (s.borderRightColor) s.borderRightColor = '';
  }

  // Also strip bgcolor attributes
  const bgElements = doc.body.querySelectorAll('[bgcolor]');
  for (const el of bgElements) {
    el.removeAttribute('bgcolor');
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
