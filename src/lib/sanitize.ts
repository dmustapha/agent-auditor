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

/** Returns true if the token symbol looks like a spam/scam airdrop token. */
export function isSpamToken(symbol: string): boolean {
  if (!symbol) return true;
  const s = symbol.toLowerCase();
  if (/https?|\.com\b|\.net\b|\.io\b|\.lat\b|\.xyz\b|\.org\b|\.dev\b/.test(s)) return true;
  if (/claim|free|bonus|reward|winner|won \$|airdrop|visit|voucher|promo/i.test(s)) return true;
  if (/\$\s*[\d,]+/.test(symbol)) return true;
  const emojiCount = (symbol.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? []).length;
  if (emojiCount >= 1) return true;
  if ((symbol.match(/\s/g) ?? []).length >= 2) return true;
  if (symbol.length > 20) return true;
  if (s === "null" || s === "undefined") return true;
  return false;
}

/** Returns true if the string is a raw hex address or "Contract 0x..." */
export function isRawAddress(value: string): boolean {
  const v = value.trim();
  return /^0x[a-fA-F0-9]{8,}/.test(v) || /^Contract\s+0x/i.test(v);
}

/** Filter protocol list — remove raw addresses, generic labels, spam */
export function cleanProtocols(protocols: readonly string[]): string[] {
  return protocols.filter(
    (p) => p && !isRawAddress(p) && p !== "ERC20" && p !== "WETH" && !isSpamToken(p),
  );
}

/** Filter token symbols — remove spam/scam tokens */
export function cleanTokenSymbols<T extends { symbol: string }>(tokens: T[]): T[] {
  return tokens.filter((t) => !isSpamToken(t.symbol));
}
