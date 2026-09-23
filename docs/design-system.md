# Hollyseams Design System — Apple HIG

The frontend follows **Apple's Human Interface Guidelines**, distilled via the
[apple-human-interface-skills](https://github.com/sankalpaacharya/apple-human-interface-skills)
playbook (tokens, fonts, apple-look checklist). Two eras exist in git history:

- **Apple HIG (current)** — system Blue accent, iOS grouped layout, Inter type.
- **Midnight Indigo (heritage)** — the original custom brand theme (Fraunces +
  Space Grotesk, indigo/mint/amber). Preserved at commit `b1fa5cc`; roll back a
  screen with `git checkout b1fa5cc -- frontend/src/app/<path>`. Its fonts and
  tokens are **not** in the live build anymore (only Inter ships — see
  `app/layout.tsx` and the top of `globals.css`), so rollback also needs
  `git checkout b1fa5cc -- frontend/src/app/layout.tsx frontend/src/app/globals.css`.

## Theme architecture

Themes are **class-driven**, not OS-driven:

- The root layout (`app/layout.tsx`) runs an inline script that adds
  `hig-light` or `hig-dark` to `<html>` **before first paint** (from
  `localStorage("hig-theme")`, falling back to `prefers-color-scheme`).
- All colours are CSS custom properties scoped under `.hig` and switched by
  `html.hig-light .hig` / `html.hig-dark .hig` in `globals.css`.- The toggle (`components/ui/theme-toggle.tsx`, top-right of the dashboard) flips the class and persists the choice; login and dashboard always agree.
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
  purely decorative: hashed from the SUBJECT's name (`avatarColor`) across an
  iOS palette (blue/purple/pink/teal/orange/green/indigo) + soft glow, so a
  job's dot always matches that subject's avatar hue.
- **Balances rows** — initials avatar tinted from the customer's name
  (`avatarColor`/`avatarTint` in `src/lib/avatar-colors.ts` — one person,
  one colour everywhere: balances, Latest-work dots, client search, fitting
  chips), name + subject chip ("Self" for self-subjects), agreed/paid line
  (paid in green), blue progress bar, bold balance + due date (red when
  overdue).
- **Tab bar** — full-bleed material (`--hig-bar` + `backdrop-blur(20px)`
  `saturate(150%)`), rounded top 24px, active tab = accent-tint pill.
  One shared `components/tab-bar.tsx` on every screen: each tab is a
  `Link` with `prefetch`, pointer cursor, and the per-screen FAB passed in as
  a prop.
- **Tap shell** — tapping a tab paints `components/ui/page-skeleton.tsx` in
  the same frame as the tap, from JavaScript already on screen, and it stays
  until the route it stands in for is both mounted *and* done loading. This is
  the fix for a real, measured problem: **the pages' own skeletons cannot
  cover a navigation**, because they ship with the JavaScript that is still
  loading, and the router keeps the old screen mounted meanwhile (~300–500ms
  per tap, ~1.9s for a route the dev server had not compiled; the API answers
  in 5–60ms, so none of it was data). `prefetch` alone did not fix it.
  The shell deliberately stops above the bar so the bar's blur and the FAB
  never flicker, and it shows the same chrome the page will (`TAB_CHROME`) so
  the headline does not snap into place. Each `app/<tab>/loading.tsx` reuses
  it for cold loads, before that route's JavaScript exists in the browser at
  all.
- **The shell outlives the page that painted it** — its state lives in
  `lib/tab-shell.ts`, a module-level store, not `useState`. A tab tap unmounts
  the page the shell was painted from, so component state would die exactly
  when the shell still has work to do; with the store, the incoming page keeps
  it up. Two things end it: the tab mounting with `loading === false` (the
  same boolean the page uses to decide whether it draws skeletons, passed to
  `TabBar` rather than recomputed, so the two cannot disagree), or its 4s
  timeout. It has to be that boolean and not the route commit: releasing at
  the commit let the page's own skeleton show through for one more frame, and
  a pulse animation restarting behind a pulse animation is what "the skeleton
  flashes twice" looks like.
- **One skeleton per shape** — every skeleton the shell draws comes from
  `components/ui/skeletons.tsx`, which the *pages* also render, and each tab
  gets its own body (job cards, avatar rows + filmstrip, statement tables,
  revenue card) rather than one generic stack of bars. A shell that draws a
  different card than the page it stands in for reads as two skeletons in a
  row — which is exactly what the first version of this looked like. The rule
  for a new skeleton: add the shape to `skeletons.tsx`, render it from the
  page, then (only if that tab has a shell) reuse it in the shell's body.
- **FAB** — 56px accent circle, white plus, flush right edge, floats above the
  bar.
- **Skeletons** — mirror real shapes (measured: chart block 183px, job row
  72px, balance row 76px, stat value + footer bars). Two kinds: the route
  shell (above), and each page's data skeletons, which take over once the
  page renders (`isPending` only — a cached page renders instantly, which is
  why a revisited tab hands over to content with no skeleton of its own).

## File map

| File | Role |
| --- | --- |
| `frontend/src/app/globals.css` | `.hig` tokens (light/dark), keyframes, reduced-motion rule |
| `frontend/src/app/layout.tsx` | Inter via `next/font`, theme-init inline script, providers |
| `frontend/src/components/ui/theme-toggle.tsx` | dark/light toggle |
| `frontend/src/components/ui/toast.tsx` | toast surface + `useToast` |
| `frontend/src/components/ui/tab-bar.tsx` | shared bottom tab bar, per-screen FAB slot, tap shell on tab press |
| `frontend/src/components/ui/page-skeleton.tsx` | the shell a tab shows before it can draw itself, one body per tab |
| `frontend/src/lib/tab-shell.ts` | which tab the shell stands in for, held outside React so it survives the tap's unmount |
| `frontend/src/components/ui/skeletons.tsx` | the skeleton shapes, shared by the pages and the shell |
| `frontend/src/app/<tab>/loading.tsx` | cold-load shell for each tab route (server-streamed) |
| `frontend/src/components/jobs/new-job-modal.tsx` | new-job sheet — also the only path that creates a client |
| `frontend/src/app/dashboard/page.tsx` | HIG overview (all tokens consumed here) |
| `frontend/src/app/(auth)/login/page.tsx` | HIG PIN login (keypad, dots, error) |

Screens read data through `frontend/src/hooks/*` and never build API URLs themselves; the
layers are `lib/api` (transport + endpoints) → `hooks` (query keys, caching) → screens.

**Cache lifetimes are a UI decision, not a default.** `lib/query-provider.tsx` sets
`staleTime: 60s` and `gcTime: 30min` deliberately. React Query's default 5-minute `gcTime`
evicted a tab you had not looked at in five minutes, so switching back re-fetched and showed
skeletons again — indistinguishable from "caching does nothing". Correctness never rests on
either value: every mutation invalidates the keys it touched (`use-jobs.ts`), so a write is
visible immediately regardless of how long data is considered fresh.

Every screen is a client component, which is why navigation needs the shell: nothing
renders until that route's JavaScript has arrived and run. If a screen ever becomes a
server component with a small client island, the shell can shrink to the island's
fallback — that is the structural version of the same fix.

## Conversion status

Every screen is on the HIG theme:

- ✅ Login, dashboard overview, theme system
- ✅ New-job sheet + toasts
- ✅ Jobs list, job detail, customers list, customer file, reports

The heritage Midnight Indigo theme is preserved at commit `b1fa5cc` — see the rollback note at
the top of this document.