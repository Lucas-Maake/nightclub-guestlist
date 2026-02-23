# Responsive Checklist

## Target Breakpoints
- Mobile: `360px - 430px`
- Tablet/iPad portrait: `768px`
- Tablet/iPad landscape: `1024px`
- Desktop: `1280px+`

## Global Responsive Patterns
- Fluid container via `.app-shell` with max width and adaptive horizontal padding.
- No fixed-width panels that exceed viewport.
- Cards and controls wrap before overflow.
- Tables wrapped in horizontal containers; mobile fallback uses card rows.

## Screen-by-Screen Checks

### `/create`
- Form fields stack to 1 column on mobile, 2 columns on larger screens.
- Share screen uses two-column layout on desktop, stacked on mobile/tablet portrait.
- Copy/share actions remain visible without horizontal scrolling.

### `/r/[id]`
- Invite preview remains readable on narrow screens.
- RSVP actions are full-width/touch-friendly on mobile.
- Capacity meter and reservation metadata stack beneath main content on smaller widths.

### `/r/[id]/host`
- Sticky search + tabs for fast filtering.
- Desktop uses table layout.
- Mobile collapses into card list with larger row height and clear status chips.
- iPad remains usable with scrollable guest list and persistent search/filter controls.

### `/r/[id]/checkin`
- Sticky top search bar.
- Large check-in buttons sized for tablet taps.
- Vertical card list optimized for standing-door operation.
- No horizontal overflow at iPad dimensions.

## Validation Notes
- `npm run check` passes (warnings only from Svelte slot deprecation notices).
- `npm run build` succeeds.
- Manual QA should include browser emulation at:
  - `390x844`
  - `430x932`
  - `768x1024`
  - `1024x768`
  - `1280x800`
