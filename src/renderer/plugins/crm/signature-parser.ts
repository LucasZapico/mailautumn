/**
 * Extract structured contact info from email signatures.
 * Parses phone numbers, job titles, companies, websites, and social links
 * from the last few lines of an email body.
 */

export interface SignatureInfo {
  name?: string;
  title?: string;
  company?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  address?: string;
}

/** Common signature delimiters */
const SIG_DELIMITERS = [
  /^--\s*$/m,           // "-- " (standard sig separator)
  /^_{3,}$/m,           // "___"
  /^-{3,}$/m,           // "---"
  /^best\s*,?\s*$/im,   // "Best,"
  /^regards\s*,?\s*$/im,
  /^thanks\s*,?\s*$/im,
  /^cheers\s*,?\s*$/im,
  /^sincerely\s*,?\s*$/im,
  /^warm regards\s*,?\s*$/im,
  /^sent from my/im,
];

const PHONE_RE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
const URL_RE = /https?:\/\/[^\s<>"',)]+/gi;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const LINKEDIN_RE = /linkedin\.com\/in\/[^\s<>"',)]+/i;

// Title keywords that suggest a line is a job title
const TITLE_KEYWORDS = /\b(ceo|cto|cfo|coo|vp|director|manager|engineer|developer|designer|founder|partner|president|analyst|consultant|specialist|coordinator|lead|head of|chief|senior|junior|associate|principal|advisor|architect|admin|assistant|officer)\b/i;

/** Strip HTML tags and decode entities */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|li)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

/** Extract signature block from the end of an email body */
function extractSignatureBlock(body: string): string | null {
  const text = stripHtml(body);
  const lines = text.split('\n');

  // Find signature delimiter from the bottom
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 30); i--) {
    for (const delim of SIG_DELIMITERS) {
      if (delim.test(lines[i].trim())) {
        return lines.slice(i + 1).join('\n').trim();
      }
    }
  }

  // No delimiter found — try last 10 non-empty lines (common in short sigs)
  const nonEmpty = lines.filter(l => l.trim()).slice(-10);
  // If the last lines have phone/url patterns, treat them as a signature
  const joined = nonEmpty.join('\n');
  if (PHONE_RE.test(joined) || TITLE_KEYWORDS.test(joined)) {
    return joined;
  }

  return null;
}

/** Parse structured info from a signature block */
function parseSignatureBlock(sig: string): SignatureInfo {
  const info: SignatureInfo = {};
  const lines = sig.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Phone
    if (!info.phone) {
      const phoneMatch = line.match(PHONE_RE);
      if (phoneMatch) {
        info.phone = phoneMatch[0];
      }
    }

    // LinkedIn
    if (!info.linkedin) {
      const liMatch = line.match(LINKEDIN_RE);
      if (liMatch) {
        info.linkedin = liMatch[0].startsWith('http') ? liMatch[0] : `https://${liMatch[0]}`;
      }
    }

    // Website (non-linkedin, non-social)
    if (!info.website) {
      const urls = line.match(URL_RE);
      if (urls) {
        const website = urls.find(u =>
          !u.includes('linkedin.com') &&
          !u.includes('twitter.com') &&
          !u.includes('facebook.com') &&
          !u.includes('instagram.com') &&
          !u.includes('mailto:')
        );
        if (website) info.website = website;
      }
    }

    // Job title (line contains title keywords and is short)
    if (!info.title && line.length < 80 && TITLE_KEYWORDS.test(line)) {
      // Clean up common prefixes
      const cleaned = line.replace(/^[-|•·]\s*/, '').trim();
      // If it also contains a company separator, split
      const parts = cleaned.split(/\s+(?:at|@|\||-|,)\s+/i);
      if (parts.length >= 2) {
        info.title = parts[0].trim();
        if (!info.company) info.company = parts[parts.length - 1].trim();
      } else {
        info.title = cleaned;
      }
    }

    // Company — line that looks like a company name (short, no phone/url, often after title)
    if (!info.company && !PHONE_RE.test(line) && !URL_RE.test(line) && !EMAIL_RE.test(line)) {
      const cleaned = line.replace(/^[-|•·]\s*/, '').trim();
      if (cleaned.length > 2 && cleaned.length < 60 && !TITLE_KEYWORDS.test(cleaned)) {
        // Might be a company name if it's capitalized or has common suffixes
        if (/\b(inc|llc|ltd|corp|co|group|labs|studio|agency|solutions|consulting|technologies|tech)\b/i.test(cleaned) ||
            /^[A-Z]/.test(cleaned)) {
          info.company = cleaned;
        }
      }
    }
  }

  // First non-empty short line might be the name (if no other info was on it)
  if (!info.name && lines.length > 0) {
    const firstLine = lines[0].replace(/^[-|•·]\s*/, '').trim();
    if (firstLine.length > 1 && firstLine.length < 50 &&
        !PHONE_RE.test(firstLine) && !URL_RE.test(firstLine) &&
        !EMAIL_RE.test(firstLine) && !TITLE_KEYWORDS.test(firstLine)) {
      info.name = firstLine;
    }
  }

  return info;
}

/** Extract contact info from an email body's signature */
export function parseSignature(htmlBody: string): SignatureInfo | null {
  const sigBlock = extractSignatureBlock(htmlBody);
  if (!sigBlock) return null;
  const info = parseSignatureBlock(sigBlock);
  // Only return if we found something useful
  if (info.phone || info.title || info.company || info.website || info.linkedin) {
    return info;
  }
  return null;
}
