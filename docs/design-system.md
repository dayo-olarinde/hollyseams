# Hollyseams Design System — Apple HIG

The frontend follows **Apple's Human Interface Guidelines**, distilled via the
[apple-human-interface-skills](https://github.com/sankalpaacharya/apple-human-interface-skills)
playbook (tokens, fonts, apple-look checklist). Two eras exist in git history:

- **Apple HIG (current)** — system Blue accent, iOS grouped layout, Inter type.
- **Midnight Indigo (heritage)** — the original custom brand theme (Fraunces +
  Space Grotesk, indigo/mint/amber). Preserved at commit `b1fa5cc`; roll back a
  screen with `git checkout b1fa5cc -- frontend/src/app/<path>`.

## Theme architecture

Themes are **class-driven**, not OS-driven:

- The root layout (`app/layout.tsx`) runs an inline script that adds
  `hig-light` or `hig-dark` to `<html>` **before first paint** (from
  `localStorage("hig-theme")`, falling back to `prefers-color-scheme`).
- All colours are CSS custom properties scoped under `.hig` and switched by
  `html.hig-light .hig` / `html.hig-dark .hig` in `globals.css`.
- The toggle (`components/theme-toggle.tsx`, top-right of the dashboard) flips
  the class and persists the choice; login and dashboard always agree.
- `<html suppressHydrationWarning>` silences the intentional pre-hydration
  class change.

## Colour tokens (`globals.css`, `.hig` block)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--hig-accent` | `#007AFF` | `#0A84FF` | the ONE accent: chart, FAB, active tab, avatars, links, subject chips |
| `--hig-accent-soft` | `rgba(0,122,255,.25)` | `rgba(10,132,255,.25)` | spinners |
| `--hig-accent-tint` | `rgba(0,122,255,.12)` | `rgba(10,132,255,.14)` | soft blue fills (chips, avatars, active tab) |
| `--hig-bg` | `#FFFFFF` | `#000000` | auth screen background |
| `--hig-fill` | `#F2F2F7` | `#2C2C2E` | keypad keys |
| `--hig-grouped` | `#F2F2F7` | `#000000` | dashboard screen background |
| `--hig-card` | `#FFFFFF` | `#1C1C1E` | card surface |
| `--hig-label` | `#000000` | `#FFFFFF` | primary text |
| `--hig-label-secondary` | `rgba(60,60,67,.6)` | `rgba(235,235,245,.6)` | secondary text |
| `--hig-label-tertiary` | `rgba(60,60,67,.3)` | `rgba(235,235,245,.3)` | tertiary text, inactive tabs |
| `--hig-dot-empty` | `rgba(0,0,0,.25)` | `rgba(255,255,255,.3)` | empty PIN dots |
| `--hig-error` | `#FF3B30` | `#FF453A` | errors |
| `--hig-separator` | `rgba(60,60,67,.29)` | `rgba(84,84,88,.6)` | hairlines, progress tracks |
| `--hig-grid` | `rgba(60,60,67,.12)` | `rgba(84,84,88,.28)` | chart gridlines |
| `--hig-bar` | `rgba(255,255,255,.78)` | `rgba(24,24,28,.78)` | tab-bar/toggle material |
| `--hig-bar-shadow` | `0 8px 24px rgba(0,0,0,.1)` | `0 8px 32px rgba(0,0,0,.5)` | floating chrome |
| `--hig-success` (+`-tint`) | `#34C759` | `#30D158` | paid/ready, green pills |
| `--hig-warning` (+`-tint`) | `#FF9500` | `#FF9F0A` | in-progress, to-collect |
| `--hig-danger` (+`-tint`) | `#FF3B30` | `#FF453A` | overdue/errors |

Rules: **one accent** (Blue) for actions/selection; green/orange/red are
semantic status only. **No gradients anywhere** — flat fills; depth comes from
surface layering and the translucent material, not borders or heavy shadows.
The only glow allowed is the 10px soft shadow on status dots.

## Typography

**Inter** (self-hosted via `next/font`, variable `--font-inter`) — the
playbook's cross-platform SF substitute. Rendered identically on every device.

| Role | Size/Line | Weight | Notes |
| --- | --- | --- | --- |
| Large Title (greeting) | 34 / 41 | medium (500) | `-0.02em` tracking |
| Revenue amount | 34 / 41 | medium | tabular numerals |
| Title 2 (stat values) | 22 / 28 | medium | tabular numerals |
| Wordmark | 20 / — | medium | `-0.02em` |
| Body (welcome, card titles) | 17 / 22 | medium for titles, regular for body | |
| Footnote (dates, captions) | 13 / 18 | regular | secondary colour |
| Section headers | 13 | semibold (600) | uppercase, `0.06em` |
| Micro (pills, chips, tab labels) | 10–11 | medium/semibold | |

Weights stay at **500 for content** (amounts, names, descriptions) so type reads
light and calm; 600 only for tiny labels/pills. All money uses
`[font-variant-numeric:tabular-nums]`.

## Layout & spacing

- **Mobile-only**, full-bleed: **no page side padding** — cards span edge to
  edge; content pads itself 16px (`px-4`). Fixed 430px column centred on
  desktop for the laptop demo.
- 8pt grid: 12px gaps between cards, 24–32px between sections, 16px inner
  card padding, 8px avatar/tag margins.
- Radius: cards 20px, tabs/avatars 10–16px, pills `rounded-full`.
- Touch targets ≥ 44px (FAB 56, tab bar 64, toggle 44).

## Motion

| Animation | Where | Spec |
| --- | --- | --- |
| `hig-rise` | page entrance | 260ms fade + 10px rise, `cubic-bezier(.4,0,.2,1)`, staggered 0→260ms |
| `hig-swap` | theme icon swap | 220ms rotate(−60°)+fade |
| `needle-pulse` | latest chart dot | 2.4s soft scale/opacity pulse |
| Count-up | money counts | 900ms cubic ease-out (rAF, honours reduced motion) |
| Progress fill | balances bars | 600ms width transition |
| Press states | buttons/FAB/tabs | 100–200ms `active:scale` |

All animations are killed under `prefers-reduced-motion` (global rule in
`globals.css`).

## Components (dashboard overview)

- **Greeting header** — wordmark + theme toggle row, date caption, Large Title
  `Morning, Wunmi — September is flying.` (personality phrase in accent),
  editorial footnote `Here's what the studio looks like.`
- **Revenue card** — chart: 340×140 viewBox, Catmull-Rom smoothed line in
  accent, flat accent-tint area wash, faint gridlines + baseline, latest point
  with halo + pulse, month labels (latest in accent).
- **Mini stats** — two full-bleed cards; glowing indicator dots (orange =
  collect, blue = bench); one-line 12px footers.
- **Grouped lists** — one card per section, hairline `divide-y` separators,
  uppercase 13px section headers with blue "View all".
- **Status** — pill carries meaning (tinted orange/green/gray); the dot is
  purely decorative: stable per-job colour hashed from the job id across an
  iOS palette (blue/purple/pink/teal/orange/green/indigo) + soft glow.
- **Balances rows** — accent-tinted initials avatar, name + subject chip
  ("Self" for self-subjects), agreed/paid line (paid in green), blue progress
  bar, bold balance + due date (red when overdue).
- **Tab bar** — full-bleed material (`--hig-bar` + `backdrop-blur(20px)`
  `saturate(150%)`), rounded top 24px, active tab = accent-tint pill.
- **FAB** — 56px accent circle, white plus, flush right edge, floats above the
  bar.
- **Skeletons** — mirror real shapes (measured: chart block 183px, job row
  72px, balance row 76px, stat value + footer bars).

## File map

| File | Role |
| --- | --- |
| `frontend/src/app/globals.css` | `.hig` tokens (light/dark), keyframes, reduced-motion rule |
| `frontend/src/app/layout.tsx` | Inter via `next/font`, theme-init inline script |
| `frontend/src/components/theme-toggle.tsx` | dark/light toggle |
| `frontend/src/app/dashboard/page.tsx` | HIG overview (all tokens consumed here) |
| `frontend/src/app/(auth)/login/page.tsx` | HIG PIN login (keypad, dots, error) |

## Conversion status

- ✅ Login, dashboard overview, theme system
- ⏳ **New-job modal + toast** — still Midnight Indigo; next to convert
- ✅ Rollback points in git history for every Midnight Indigo screen