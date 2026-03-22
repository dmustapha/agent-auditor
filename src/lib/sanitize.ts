const INJECTION_PATTERNS = [
  /\[SYSTEM\]/gi,
  /\[INST\]/gi,
  /<\|.*?\|>/gs,
  /ignore\s+(all\s+)?previous\s+instructions?/gi,
  /new\s+instructions?:/gi,
  /you\s+are\s+now/gi,
  /\bassistant\s*:/gi,
  /\bsystem\s*:/gi,
  /do\s+not\s+follow/gi,
  /override\s+(all\s+)?rules/gi,
  /forget\s+(all\s+)?(previous\s+)?instructions/gi,
];

export function sanitizeForPrompt(value: string, maxLength = 200): string {
  let s = value.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, "");
  for (const p of INJECTION_PATTERNS) s = s.replace(p, "[REDACTED]");
  return s.slice(0, maxLength);
}

export function sanitizeHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
