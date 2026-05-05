# Apple Design System: Complete Reference

> Source: https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/apple/DESIGN.md
> Adapted for `crypto-ai-trader` frontend.

This document outlines Apple's comprehensive design language—a photography-first approach emphasizing minimal UI chrome that lets products dominate the visual narrative.

## Core Philosophy

"A photography-first interface that turns marketing into a museum gallery" where UI recedes entirely. The system employs alternating full-bleed tiles (white/parchment ↔ near-black), a single blue accent (`#0066cc`), and SF Pro typefaces with signature tight letter-spacing.

> **Project note:** This dashboard is data-dense, not photography-led. We import the *language* (single blue accent, SF Pro stack, pill CTAs, near-black tile palette, hairline borders, single-shadow rule, 8px scale) but skip the alternating full-bleed marketing tiles.

## Color Palette

**Interactive:** Action Blue `#0066cc`, Focus Blue `#0071e3`, Sky Link Blue `#2997ff`

**Surfaces:** Pure White `#ffffff`, Parchment `#f5f5f7`, Pearl `#fafafc`, Near-Black Tile variants (`#272729`, `#2a2a2c`, `#252527`), Pure Black `#000000`

**Text:** Near-Black Ink `#1d1d1f`, Body-on-Dark `#ffffff`, Body Muted `#cccccc`, Ink Muted `#333333` and `#7a7a7a`

**Borders:** Divider Soft `#f0f0f0`, Hairline `#e0e0e0`

**Prohibition:** Zero decorative gradients; atmosphere derives from photography exclusively.

## Typography System

**Fonts:** SF Pro Display (display sizes ≥19px) and SF Pro Text (body/UI), with fallback stack `system-ui, -apple-system, sans-serif`

**Key sizes:**
- Hero Display: 56px / 600 weight / -0.28px tracking
- Display Large: 40px / 600 weight / 0 tracking
- Body: 17px / 400 weight / 1.47 line-height / -0.374px tracking
- Headline weight is exclusively 600; 500 deliberately absent from the ladder

## Spacing & Layout

**Base unit:** 8px

**Tokens:** xxs 4px · xs 8px · sm 12px · md 17px · lg 24px · xl 32px · xxl 48px · section 80px

## Elevation & Shadows

**Single rule:** "Exactly one drop-shadow in the entire system"—`rgba(0, 0, 0, 0.22) 3px 5px 30px`—applied only to product renders resting on a surface. Never on cards, buttons, or text.

## Border Radius Scale

- `none` 0px (full-bleed tiles)
- `xs` 5px
- `sm` 8px (utility buttons, inline imagery)
- `md` 11px (Pearl Buttons)
- `lg` 18px (store utility cards)
- `pill` 9999px (primary CTAs, search, configurator chips)
- `full` 9999px / 50% (circular control chips)

## Component Specs

### Navigation
- **Global Nav:** Black background, 44px height, 12px text, always pinned
- **Sub-Nav Frosted:** Parchment at 80% opacity with backdrop-filter blur, 52px height, 21px category title, persistent primary CTA right-aligned

### Buttons
- **Primary Pill:** Action Blue background, white text, full-pill radius
- **Secondary Pill:** Transparent background, blue border/text, same pill shape
- **Dark Utility:** Black background, white text, 8px radius, compact sizing for global nav actions
- **Pearl Capsule:** Pearl background, muted-ink text, soft-divider border, 11px radius

All buttons activate via `transform: scale(0.95)` micro-interaction.

### Cards & Tiles
- **Store Utility Card:** White background, 18px radius, 24px padding, 1px hairline border
- **Configurator Chip:** Pill-shaped, white background, 12px × 16px padding

### Inputs
- **Search Input:** White background, pill radius, 44px height, 17px body text, hairline border

## Do's

- Use `#0066cc` (single blue) for all interactive elements—no second accent
- Set headlines in SF Pro Display 600 with negative letter-spacing for "tight" cadence
- Run body at 17px / 400 / 1.47 line-height
- Reserve `pill` radius for primary CTAs and action-intent elements
- Use `scale(0.95)` as button active state everywhere
- Keep global nav pure black

## Don'ts

- No second accent color
- No shadows on cards, buttons, or type (photography only)
- No decorative gradients
- No weight-500 type (ladder is 300/400/600/700)
- Don't tighten body line-height below 1.47
- Don't mix radius grammars arbitrarily

---

This system achieves minimalism through constraint: one accent, one shadow, one typeface hierarchy.
