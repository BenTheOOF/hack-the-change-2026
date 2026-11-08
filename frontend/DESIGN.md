# PhysioTrace design system

Direction: **quiet clinic garden**. Forest green, sage and clay on warm paper,
the same identity the app already has, made consistent and accessible. The
interface is a tool people use while recovering, often on a phone propped on
a shelf, so it favours large readable type, clear status colour, calm surfaces
and one obvious next step per screen. Serif (Georgia) appears only in human,
care-giving moments: the landing headline accent, the therapist's note, the
camera prompt and the privacy dialog.

Everything below lives as CSS custom properties on `:root` in
`src/app/globals.css`. Components use the tokens, never raw values.

## Colour

All text pairs pass WCAG AA (4.5:1) on the surface they sit on; input borders
and the focus ring pass 3:1.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f7f8f4` | page background |
| `--surface` | `#ffffff` | cards, inputs, sidebar |
| `--surface-muted` | `#f0f3ec` | hover, selected nav, quiet panels |
| `--border` | `#e1e6dc` | card and divider lines |
| `--border-input` | `#8a9787` | form control outline (3.06:1) |
| `--text` | `#213a31` | primary text (11.5:1) |
| `--text-muted` | `#5c665d` | secondary text (5.6:1 on bg) |
| `--primary` | `#335e49` | primary buttons, links, active nav |
| `--primary-hover` | `#284c3a` | primary hover/press |
| `--on-primary` | `#ffffff` | text on primary (7.4:1) |
| `--accent` | `#9a4f36` | clay text accents, destructive text (5.9:1) |
| `--focus` | `#b0603f` | focus ring (4.3:1) |
| `--tint-sage` / `--tint-sand` / `--tint-clay` | `#e9f0e2` / `#f1efe5` / `#f5e8df` | stat cards, art panels |
| `--success-fg` / `--success-bg` | `#456838` / `#e5efd9` | correct rep, ready, saved |
| `--warning-fg` / `--warning-bg` | `#7a5f22` / `#f5eed9` | inconclusive, queued, notices |
| `--danger-fg` / `--danger-bg` | `#8f513a` / `#f5e4d8` | incorrect rep, failed, errors |
| `--stage` / `--on-stage` / `--on-stage-muted` | `#1f332b` / `#e7efe2` / `#b9c8b2` | camera and replay surfaces |

Status is never colour alone: every badge and banner also carries a word.

## Type

System UI stack (no font download), Georgia for the serif moments.
Base 16px, minimum 14px for any readable text. Exceptions: camera overlay
chips scale with the camera (12 to 14px), and the movement gauge labels are
12px on phones.

| Token | Size / line height | Use |
|---|---|---|
| `--text-sm` | 14px / 1.5 | meta, badges, captions, labels |
| `--text-md` | 16px / 1.6 | body, buttons, inputs |
| `--text-lg` | 18px / 1.45 | card titles, h3 |
| `--text-xl` | 22px / 1.3 | section titles, h2 |
| `--text-2xl` | `clamp(28px, 4vw, 36px)` / 1.15 | page titles, h1 |
| `--text-stat` | `clamp(32px, 5vw, 44px)` / 1.1 | stat numbers, rep count |
| `--text-hero` | `clamp(48px, 9vw, 88px)` / 1.05 | landing headline only |

Weights: 400 body, 600 headings and buttons. No uppercase tracked labels;
small section labels are sentence case at `--text-sm`, weight 600, muted.

## Space, radius, elevation

- Spacing scale (4px base): `--space-1` 4, `--space-2` 8, `--space-3` 12,
  `--space-4` 16, `--space-5` 24, `--space-6` 32, `--space-7` 48, `--space-8` 64.
- Page gutter: `--gutter` = 16px phone, 24px tablet, 40px desktop.
- Radius: `--radius-sm` 6px (badges, chips), `--radius` 10px (buttons, inputs,
  cards), `--radius-pill` 999px (segmented control, chips).
- Elevation: flat surfaces separated by `--border`. One shadow,
  `--shadow-overlay` (`0 8px 32px rgb(31 51 43 / 0.14)`), only for things
  that float: the modal and the camera overlays.

## Controls

- `.primary` / `.secondary` / `.text-button`: one height, `--control-h` 44px;
  `.small` variant 36px on fine pointers only, 44px on touch.
- Inputs, selects and textareas share one style: `--surface`, `--border-input`,
  `--radius`, 44px tall, 16px text (no iOS zoom on focus).
- Focus: 3px `--focus` outline, 2px offset, on every interactive element.
- Icons: one inline SVG set (`Icon` component, 20px, 1.75 stroke,
  `currentColor`). No emoji or Unicode glyphs as icons. Decorative icons get
  `aria-hidden`.

## Layout

- Mobile first. Breakpoints: 600px (tablet), 960px (sidebar appears),
  1280px (wide).
- Below 960px: slim top bar (brand, role switch) and a fixed bottom tab bar
  with icon + label tabs, 56px tall plus the safe-area inset.
- 960px and up: 240px sidebar, content max width 1200px, two-column
  dashboards (main plus a 320px aside).

## Motion

- `--dur-fast` 150ms (hover, press), `--dur` 200ms (banners, panels),
  `--ease` `cubic-bezier(0.2, 0, 0, 1)`.
- Animate only colour, opacity and transform. No pulsing, no looping motion,
  no scroll reveals.
- `prefers-reduced-motion: reduce` sets every duration to 0.
