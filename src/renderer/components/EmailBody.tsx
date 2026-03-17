/**
 * Inline email body renderer — replaces EmailFrame iframes.
 * Sanitizes HTML, strips embedded styles and inline colors for dark mode,
 * and renders directly in the DOM (inherits app theme automatically).
 */

import { useMemo, useRef, useEffect } from 'react';

/** Strip <style> blocks and <script> tags for safety + dark mode */
function stripStyleAndScript(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

/** Strip inline style color/background properties, preserve layout (width, padding, etc.) */
function stripInlineColors(html: string): string {
  // Process style attributes — remove color-related properties, keep layout
  return html.replace(/\bstyle\s*=\s*"([^"]*)"/gi, (_match, styles: string) => {
    const cleaned = styles
      // Remove color properties
      .replace(/\b(?:color)\s*:\s*[^;]+;?/gi, '')
      // Remove background-color
      .replace(/\bbackground-color\s*:\s*[^;]+;?/gi, '')
      // Remove background shorthand UNLESS it has url() (preserve images)
      .replace(/\bbackground\s*:\s*([^;]+);?/gi, (_m, val) =>
        val.includes('url(') ? `background: ${val};` : ''
      )
      .trim();
    return cleaned ? `style="${cleaned}"` : '';
  });
}

/** Remove bgcolor and color HTML attributes */
function stripColorAttrs(html: string): string {
  return html
    .replace(/\s+bgcolor\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+color\s*=\s*["'][^"']*["']/gi, '');
}

/** Process email HTML for inline dark-mode rendering */
function processForDarkMode(html: string): string {
  let processed = stripStyleAndScript(html);
  processed = stripInlineColors(processed);
  processed = stripColorAttrs(processed);
  return processed;
}

/** Process email HTML for inline light-mode rendering */
function processForLightMode(html: string): string {
  let processed = html;
  // Still strip scripts for safety
  processed = processed.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  // Strip <style> blocks to prevent CSS leaking into the app
  processed = processed.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  return processed;
}

const emailBodyStyles = [
  // Text
  'text-sm leading-relaxed break-words',
  // Links
  '[&_a]:text-accent [&_a]:underline [&_a]:break-all',
  // Headings
  '[&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2',
  '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1',
  '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1',
  // Quotes
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border-primary [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary [&_blockquote]:italic',
  // Lists
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
  // Code
  '[&_pre]:bg-bg-tertiary [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:my-2 [&_pre]:text-xs [&_pre]:overflow-x-auto',
  '[&_code]:text-xs [&_code]:font-mono',
  // Tables
  '[&_table]:max-w-full [&_table]:my-2 [&_td]:py-1 [&_td]:pr-4',
  // Images
  '[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded',
  // Horizontal rules
  '[&_hr]:border-border-primary [&_hr]:my-4',
].join(' ');

export default function EmailBody({ html, dark = false, className = '' }: {
  html: string;
  dark?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const processedHtml = useMemo(() => {
    return dark ? processForDarkMode(html) : processForLightMode(html);
  }, [html, dark]);

  // Open links in system browser instead of navigating the app
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a');
      if (link?.href && !link.href.startsWith('javascript:')) {
        e.preventDefault();
        window.open(link.href, '_blank');
      }
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [processedHtml]);

  return (
    <div
      ref={containerRef}
      className={`email-body text-text-primary overflow-hidden ${emailBodyStyles} ${className}`}
      dangerouslySetInnerHTML={{ __html: processedHtml }}
    />
  );
}
