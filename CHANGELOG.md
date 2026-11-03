# Changelog

All notable changes to the ESB Studio Phone project.

## [0.2.0] - 2026-11-03

### Mobile-Native Redesign from First Principles (Galaxy S25 Ultra)

#### Core Architecture & Shell
- Replaced legacy header and nav with native mobile component primitives:
  - `TopAppBar`: Brand header with title, subtitle, hamburger drawer toggle, theme cycle, and reactive AI status chip.
  - `BottomNav`: Thumb-reachable navigation bar with active indicator pills and status badges for Home, Edit, Banner, and Publish.
  - `NavDrawer`: Android navigation drawer featuring unstyled ESB Power Line logo, live CMS connectivity status, navigation items, Keystore settings link, and versioning.
  - Edge-to-edge support with safe-area insets (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`).
  - Landscape / DeX reflow: transforms navigation to a left rail with 2-pane layout for viewports $\ge 900$ px.

#### Mobile Component Kit (`src/ui/kit/`)
- Strict 4 dp spacing scale (`--sp-1` through `--sp-9`).
- Minimum touch target $\ge 48 \times 48$ dp on all interactive buttons, inputs, and selectors.
- Comprehensive primitive kit: `TopAppBar`, `BottomNav`, `NavDrawer`, `BottomSheet`, `SelectSheet`, `Button`, `ExtendedFAB`, `StatusChip`, `AiSheet`.
- Living Component Gallery route (`?gallery`) for visual inspection.

#### Home & Editorial Intake
- Balanced hero section: identical dimensions and visual weight for Editorial and Graphics launcher tiles.
- Added "+ New story" Extended FAB in the thumb zone.
- Expandable search and filter bar that does not crowd the viewport.
- Smart auto-detecting clipboard paste in Story Desk intake (distinguishes URLs from raw article copy).

#### Editorial Desk (`Edit.tsx`)
- Soft keyboard handling: `html.kb-open` hides top and bottom app bars, giving the writer full viewport focus.
- Keyboard accessory bar docked above the virtual keyboard with paragraph tools (Move Up, Move Down, Split, Merge, Add, Delete, Find, Done).
- Removed oversized button clusters under each paragraph in favor of the docked accessory bar.
- Repositioned the next-step card (`.ed-actions`) from sticky floating overlay to a calm, relative card at the document end to prevent covering story text.
- Interactive "Fix" badges in Publish checklist that navigate directly to Edit and Banner blockers.
- Caret stability and Hind Siliguri 1.6 line-height typography preserved.

#### Banner Studio (`Banner.tsx`)
- Scaled banner viewport from `44dvh` to `32dvh` to ensure headline editing is immediately visible without scrolling.
- Replaced text `...` fallback with SVG layout wireframes for Classic, News Link, and Photo Overlay templates.
- Disabled textarea grab resize handles (`resize: none !important;`).

#### Settings & AI States
- Grouped list layout adhering to standard Android settings patterns (AI Configuration, Facebook Page, Site Account, Appearance, Privacy, About).
- Hardware-backed secrets stored strictly in Android Keystore via `SecureStorage` (never in logs or localStorage).
- Dedicated `AiSheet` launched from the top bar AI chip:
  - Master AI pause switch mirroring desktop behavior.
  - Active Gemini 2.5 Flash model indication and honest "Planned" badges for Claude and OpenAI.
  - On-device key test action.
- Added `Escape` key and back-button dismissal to Settings.
