# Shared Context — AgentAuditor Design Variations

## 1. Content Inventory

### Header
- Title: "AgentAuditor"
- Subtitle: "Trust scores for AI agents across EVM chains"

### SmartInput Component
- Text input with placeholder: "Enter Agent ID, address, or name..."
- Auto-detects input type and shows hint badge (right side):
  - Numeric → "Agent ID detected"
  - 0x + 40 hex chars → "Address detected"
  - Ends with .eth → "ENS name detected"
  - Other text → "Name search"
- Has disabled state (opacity 50%)
- Submit on Enter key

### ChainSelector Component
- Dropdown select with options:
  - All Chains (default)
  - Base
  - Gnosis
  - Ethereum
  - Arbitrum
  - Optimism
  - Polygon
- Has disabled state

### LoadingState Component
- Skeleton shimmer loading (NOT a spinner — per forbidden patterns)
- Text: "Fetching onchain data and running analysis..."
- Centered in a card container

### TrustScoreCard Component
- **Header row:** Agent address (monospace, truncated) + chain badge pill + recommendation badge (SAFE=green, CAUTION=yellow, BLOCKLIST=red)
- **Score gauge:** SVG ring/arc showing score 0-100 with color matching recommendation
- **Breakdown bars (4 axes):**
  - Transaction Patterns (0-25)
  - Contract Interactions (0-25)
  - Fund Flow (0-25)
  - Behavioral Consistency (0-25)
- **Flags section:** Severity-colored alerts (CRITICAL=red, HIGH=yellow, MEDIUM/LOW=subtle)
  - Each flag has: severity badge, description, optional evidence text
- **Summary:** AI-generated text summary of findings
- **Timestamp:** "Analyzed [datetime]"

### TransactionTable Component
- Header: "Recent Transactions"
- Table columns: Hash (linked to explorer), From, To, Value (ETH), Time
- Addresses truncated (6...4)
- Values formatted (0, <0.001, or 4 decimals)
- Hover state on rows
- Empty state: "No transactions found" centered in card

### Error State
- Red-bordered card with error message text
- Example: "Failed to connect to analysis service"

### Application States (mutually exclusive below header)
1. **Empty** — Just header + input + chain selector, no results
2. **Loading** — Input disabled + loading skeleton
3. **Results** — TrustScoreCard + TransactionTable
4. **Error** — Error message card

## 2. Design Tokens

### Colors (OKLCH — project palette)
```
--surface:        oklch(0.13 0.00 0)      /* #0a0a0a — near-black base */
--surface-raised: oklch(0.18 0.00 0)      /* #141414 — elevated surfaces */
--surface-hover:  oklch(0.21 0.00 0)      /* #1a1a1a — hover state */
--border:         oklch(0.27 0.00 0)      /* #262626 — borders */
--text-primary:   oklch(0.98 0.00 0)      /* #fafafa — primary text */
--text-secondary: oklch(0.68 0.00 0)      /* #a3a3a3 — secondary text */

--accent:         oklch(0.72 0.19 150)    /* #22c55e — green, trust concept */
--safe:           oklch(0.72 0.19 150)    /* #22c55e — SAFE recommendation */
--caution:        oklch(0.79 0.18 85)     /* #eab308 — CAUTION recommendation */
--blocklist:      oklch(0.63 0.22 27)     /* #ef4444 — BLOCKLIST/danger */
```

### Typography
- **Display/Headings:** Geist (already installed, geometric sans)
- **Monospace (addresses, hashes, code):** JetBrains Mono (already installed)
- **Fluid type scale:**
  - Display: clamp(2rem, 4vw, 3.5rem)
  - H1: clamp(1.75rem, 3vw, 2.5rem)
  - H2: clamp(1.25rem, 2vw, 1.75rem)
  - Body: 1rem (16px)
  - Small: 0.875rem (14px)
  - Caption: 0.75rem (12px) — minimum floor

### Spacing
```
--space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem;
--space-6: 1.5rem; --space-8: 2rem; --space-12: 3rem; --space-16: 4rem;
--space-24: 6rem;
```

### Animation Tokens
```
--duration-fast: 150ms;
--duration-normal: 300ms;
--duration-slow: 500ms;
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Border Radius
```
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 16px;
--radius-xl: 24px;
--radius-full: 9999px;
```

## 3. Color Hue Rotation — OKLCH (MANDATORY)

Your assigned hue offset: [SEE AGENT-SPECIFIC PROMPT]
Your chroma adjustment: [SEE AGENT-SPECIFIC PROMPT]

BEFORE applying your DNA Color gene, rotate ALL palette OKLCH hues below by
your offset. If your chroma adjustment is "reduce 15-25%", multiply each
color's chroma (C) by 0.75-0.85. This rotated+adjusted palette is your new
starting point. Then apply your Color gene (Mono/Duo/Vibrant/Neutral/Gradient)
on top.

**Hue rotation applies to these colors:**
- accent: oklch(0.72 0.19 150)
- safe: oklch(0.72 0.19 150)
- caution: oklch(0.79 0.18 85)
- blocklist: oklch(0.63 0.22 27)

**Neutrals (chroma < 0.03) are EXEMPT from rotation:**
- surface, surface-raised, surface-hover, border, text-primary, text-secondary

IMPORTANT: The semantic meaning of safe/caution/blocklist colors MUST be preserved
even after rotation. Green-ish = safe, yellow-ish = caution, red-ish = danger.
These status colors should NOT be rotated — only the accent/brand colors rotate.

Use oklch() natively in CSS. Do NOT convert to HSL — HSL lightness is
perceptually broken (blue looks dark, yellow looks bright at same L).

## 4. Dials & Overrides

| Dial | Value | Tier |
|------|-------|------|
| DV (Design Variance) | 8 | Editorial — asymmetric grids, broken alignment |
| MI (Motion Intensity) | 6 | Tier 2.5 — CSS + Vanilla JS + WAAPI |
| VD (Visual Density) | 8 | Cockpit — dense data, compact spacing |

**Color Mode:** Dark-only
**Industry:** DeFi / Developer Tools hybrid
**Project Type:** Single-page dashboard (input → results)

## 5. Visual References

See `design-variations/references/research-brief.md` for full analysis.

Key quality targets:
- Arkham Intelligence level data density and authority
- Nansen level polish and gradient work
- DeBank level compact efficiency
- Professional dark theme, NOT generic/playful

## 6. Quick-Scan Checklist + Toxic Combinations

### Quick-Scan (16 checks — must pass before submission)
1. [ ] No pure #000000 backgrounds
2. [ ] No oversaturated accents (max 85% sat HSL)
3. [ ] No purple as default primary
4. [ ] Font minimum 12px
5. [ ] 2+ distinct border-radius values used
6. [ ] 2+ font weights used
7. [ ] prefers-reduced-motion included
8. [ ] No transition:all
9. [ ] No h-screen without h-dvh fallback
10. [ ] No cursor:url() custom cursors
11. [ ] No z-index above 999
12. [ ] No Lorem ipsum or placeholder text
13. [ ] Section padding min py-16 (hero py-20)
14. [ ] Card gap min gap-4
15. [ ] Dark mode has more than just bg+text changes
16. [ ] No identical card layouts across sections

### Toxic Combinations (FAIL if 4+/5 match)
- **AI Uniform:** centered layout + Inter/system font + blue accent + fade-up animation + 3-column grid
- **Dark Mode Cliche:** black bg + purple/cyan combo + glassmorphism + glow effects + gradient heading

## 7. Spacing & Density Laws (STATIC RULES)

- **Spacing floors:** Within component: gap-2 min. Title→body: mb-3/mb-4. Between cards: gap-4 min. Sections: py-16 min (hero py-20). Heading→subtitle: mt-2. Subtitle→body: mt-4.
- **Font minimum:** 12px floor (text-xs). Exception: legal at 11px.
- **Hierarchy tiers:** PRIMARY (1-2/view): text-base+ title, p-6, full treatment. SECONDARY (2-4): text-sm, p-5, standard. UTILITY: text-sm, p-4, minimal. Mark: `{/* PRIMARY */}` etc. Same tier = identical decoration.
- **Density:** Sidebar: max 3 stacked cards. Main: max 4 sections without scroll. Dashboard: ≥1 empty grid cell.
- **Wire-everything:** Every CSS class, keyframe, import must be used. No dead code.
- **Scroll-triggered motion:** MI ≥ 5: section headings + focal elements must animate on entry (IntersectionObserver). MI < 5: CSS-only animation on load (fade/slide via @keyframes), no JS.

## 8. Technical Constraints

- Stack: Next.js 16.2.0, Tailwind 4.2.2, TypeScript
- Fonts installed: Geist (package), JetBrains Mono (to be used via CDN in HTML variations)
- Single-page dashboard — NOT a multi-page marketing site
- Variations use Tailwind CDN (standalone HTML files)
- postcss.config.mjs already configured with @tailwindcss/postcss
- Dark-only — no light mode toggle needed in variations
