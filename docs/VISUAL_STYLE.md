# Visual Style

## Target Reference
- Visual direction intentionally aligns with the look/feel of `getapollo.in`:
  - dark-first, near-black canvas
  - restrained contrast and subtle borders
  - premium rounded surfaces
  - sparse, meaningful accent color

## Theme Foundation
- Core token source: `src/app.css`
- Tailwind mapping: `tailwind.config.ts`
- Tokens use CSS variables in shadcn-style naming (`--background`, `--card`, `--primary`, etc.)

## Token Summary
- Background: deep charcoal/black
- Surface: slightly elevated charcoal cards
- Border: low-contrast cool gray
- Primary action: cool blue
- Success state: muted green
- Radius scale:
  - `2xl` / `3xl` for premium cards
  - `pill` for controls/chips
- Shadows:
  - `surface` for standard cards
  - `lift` for overlays/dialog-style layers

## Layout Rules
- Global container: `.app-shell` (`max-w-7xl`, fluid side padding)
- Large vertical whitespace between sections
- Hero + utility panel composition for major screens
- Dense operational screens (host/check-in) keep sticky controls and scrollable lists

## Typography
- Sans stack tuned for modern hospitality-tech tone:
  - `Satoshi`, `Avenir Next`, `Segoe UI`, sans-serif fallback
- Hierarchy:
  - bold section titles
  - low-noise body copy
  - uppercase micro-labels for metadata

## Component Styling Notes
- Buttons:
  - pill shape
  - blue primary
  - subdued outline variant
- Cards:
  - large radius
  - subtle blur and shadow lift
- Inputs:
  - rounded, low-chroma surfaces
  - visible focus ring for accessibility
- Tabs + table:
  - operational clarity over ornament
  - clear selected state and large touch targets

## Accessibility
- Dark-mode contrast tuned toward WCAG AA where feasible.
- Focus ring present on interactive controls.
- Color is not the only status signal (labels/chips accompany color states).
