# Mobile UI & UX Audit: ESB Studio Phone

**Target Device:** Samsung Galaxy S25 Ultra (`SM-S938B`, codename `pa3q`)  
**Screen Specifications:** 1440 × 3120 px, 560 dpi (~411.4 × 891.4 CSS dp, 3.5x DPR, 19.5:9 aspect ratio)  
**Inspection Technique:** Physical device connected over USB debugging via ADB + Chrome DevTools Protocol (`localabstract:webview_devtools_remote_557`)  
**Audit Date:** 2026-11-03

---

## 1. Executive Summary

ESB Studio Phone was created as a companion app to the desktop Electron application (*ESB AI Studio*). While the core headless logic (Gemini translation, fact-checking, banner rendering, Supabase sync) functions well, the visual interface and ergonomics suffer from desktop-first legacy patterns. The app exhibits critical layout overflows that break screen boundaries, severe touch target collisions, confusing navigation states, non-interactive visual affordances, and vertical space starvation on 412 dp portrait mobile viewports.

---

## 2. Screenshot Inventory (`docs/screens/`)

| Screenshot File | Screen / View State | Theme & Mode | Key Findings |
|---|---|---|---|
| `screen_home.png` | Launcher (Home) | Light Portrait | Brand logo hidden in top bar; floating sync dot; hero takes up top half |
| `screen_dark_home.png` | Launcher (Home) | Dark Portrait | Teal/orange ambient gradient; search + 4 chips push recent stories down |
| `screen_desk_intake_real.png` | Editorial Desk (`Desk.tsx`) - Link | Light Portrait | Bottom nav erroneously indicates "Publish"; pipeline indicator cut off |
| `screen_desk_paste_text.png` | Editorial Desk - Text mode | Light Portrait | Pipeline indicators cut in half vertically; desktop resizer grip on textarea |
| `screen_edit_live.png` | Edit Desk - Initial | Light Portrait | Viewport pushed out of bounds; nav and status bar disappear when scrolled |
| `screen_edit_with_story_live.png` | Edit Desk - English draft | Light Portrait | Dock action bar collides with & covers bottom content; slug card hidden |
| `screen_edit_source.png` | Edit Desk - Bengali source | Light Portrait | Readiness ring `[ 5 ]` partially obscured under translucent dock |
| `screen_dark_edit.png` | Edit Desk - English draft | Dark Portrait | High contrast action buttons; severe obscuration of SEO card behind dock |
| `screen_banner_live.png` | Banner Desk - Initial | Light Portrait | Preview canvas occupies >50% of height; headline textarea pushed below fold |
| `screen_banner_scrolled.png` | Banner Desk - Scrolled | Light Portrait | Preview scrolls off top; user cannot see banner preview while typing headline |
| `screen_banner_template.png` | Banner Desk - Template sub-tab | Light Portrait | Template cards show empty grey box with `...`; 3rd card cut off at bottom |
| `screen_banner_size.png` | Banner Desk - Size sub-tab | Light Portrait | Aspect ratio cards clean but canvas remains pushed upwards |
| `screen_banner_export.png` | Banner Desk - Export sub-tab | Light Portrait | Export buttons disabled until headline exists; top preview clipped |
| `screen_publish_live.png` | Publish Desk | Light Portrait | Stepper at top; "Fix" badges are static non-clickable spans; Details cut off |
| `screen_dark_publish.png` | Publish Desk | Dark Portrait | Dark surfaces; static "Fix" badges look like buttons but do nothing |
| `screen_settings.png` | Settings Modal | Light Portrait | Bottom site account section clipped by screen edge |
| `screen_dark_settings.png` | Settings Modal | Dark Portrait | Grouped settings list; lacks standard Android grouped list styling |
| `screen_landscape.png` | Home / DeX Landscape | Dark Landscape | Left rail active pill marker slices through "Home" text; story list clipped |

---

## 3. Detailed Findings by Screen & Subsystem

### 3.1 Shell & Navigation
1. **Broken Scroll Boundaries in Desk Intake (`hm-deskpane`):**
   - **Root Cause:** In `src/App.tsx#L89`, `<main className="sh-pane-main sh-page hm-deskpane">` lacks `overflow: auto`.
   - **Impact:** When text or URLs are entered, `document.documentElement.scrollHeight` expands to 969 px (`innerHeight` is 891 px). This forces `.sh-app` to overflow, pushing the bottom navigation bar and status bar off the physical display.
2. **Ghost Sync Dot in Top Header:**
   - **Root Cause:** In `src/ui/home.css`, `.sh-app.hm-on .sh-logo { visibility: hidden; }` hides the brand logo on Home. Because `.sh-grow` flexes and `.sh-sync-text` is hidden on mobile (`display: none`), only a solitary green status dot floats in the middle-left of the top bar.
3. **Small Touch Target on Gemini Chip:**
   - **Root Cause:** In `src/ui/shell.css`, `.sh-chipbtn` has a height of 36 px (touch target should be $\ge 48$ px).
4. **Left Rail Indicator Clipping in Landscape:**
   - **Root Cause:** In `src/ui/shell.css#L44-L45`, `.sh-nav-ind` is positioned at `right: 0` with width 4 px, but in 88 px width rail, the active indicator slice overlaps the text label.

### 3.2 Home Launcher
1. **Vertical Space Inefficiency:**
   - The large hero unit ("ESB POWER LINE | Ai Studio" + tagline) takes up 260 px.
   - The search input (48 px) and filter chips row (44 px) consume another 110 px.
   - On a 891 px screen, only 1 recent story card is visible before the fold.
2. **Missing Floating Action Button (FAB):**
   - To create a new story from Home, users must tap the top Editorial or Graphics tile. There is no standard Android "New Story" extended FAB in the thumb zone.

### 3.3 Edit Desk (The Core Newsroom Screen)
1. **Bottom Dock Overlap & Collision:**
   - **Root Cause:** The docked action bar (`.ed-actions`, height ~65 px) is sticky to the bottom (`bottom: calc(-1 * var(--s-8))`).
   - **Impact:** The scrollable area `.phone-main` lacks bottom padding (`padding-bottom: var(--s-8)` = 32 px). The bottom 60 px of content (such as the slug/SEO card and the readiness button `[ 5 ]`) is permanently occluded behind the frosted action bar.
2. **Desktop Resize Handles on Mobile Textareas:**
   - Textareas in Edit, Desk, and Banner show the diagonal desktop resize grip (`//`) on mobile Chrome/WebView because `resize: none` is omitted.
3. **Conflicting Word Count Feedback:**
   - Story card says `0 words · ~0 min read` (measuring English text), while the bottom status bar says `20 words · ~1 min` (measuring Bengali source text).
4. **Aggressive Subtitle Truncation:**
   - Headline & deck subtitle truncates into `English copy for esbpowerlin...` despite available width.

### 3.4 Banner Desk (Graphics)
1. **Preview Canvas Dominates Viewport:**
   - The canvas card takes over 50% of the screen height.
   - The editing card below it is pushed down such that only the top 10 px of the headline textarea is visible.
   - When scrolling down to type, the canvas preview scrolls completely out of view, defeating live preview.
2. **Placeholder Thumbnails:**
   - In the Template sub-tab, cards show `...` inside empty grey rectangles rather than visual wireframes or icons.

### 3.5 Publish Desk
1. **Deceptive Static "Fix" Badges:**
   - In `src/publish/Publish.tsx`, readiness blockers show bright pink pill badges labeled **"Fix"**.
   - These are static `<span className="pub-mark">` elements with no click handlers or pointer affordances. Users tapping them expecting to jump to the missing field receive zero response.
2. **Details Card Bottom Truncation:**
   - The category selector in the Details card is cut off at the bottom by the status bar due to missing bottom scroll padding.

### 3.6 Settings & Menus
1. **Lack of Standard Android Drawer (Burger):**
   - Currently, secondary destinations (Help, About, Account status) are crammed into a generic modal sheet without an accessible navigation drawer.
2. **Bottom Section Clipping:**
   - The site account section at the bottom of the Settings sheet is clipped by the screen boundary.

---

## 4. Remediation Plan

1. **Step 2 (Design Spec):** Author `docs/MOBILE_DESIGN.md` defining mobile-first ergonomics, the 4 dp spacing scale, unified navigation (bottom nav + navigation drawer), the component kit (`src/ui/kit/`), and per-screen wireframes.
2. **Step 3 (Component Kit):** Build the reusable mobile component primitives in `src/ui/kit/` (TopAppBar, BottomNav, NavDrawer, BottomSheet, TextField, Chip, Button, ListCard) with `?gallery` verification.
3. **Step 4 (Screen Rebuilds):**
   - Rebuild Shell (AppBar, NavDrawer, BottomNav with proper insets).
   - Rebuild Home (compact hero, balanced desk tiles, thumb-zone FAB, expandable search).
   - Rebuild Desk Intake (fix `hm-deskpane` overflow, unified single paste hero).
   - Rebuild Edit Desk (keyboard accessory bar, padded scroll clearance, category bottom sheet).
   - Rebuild Banner Desk (compact canvas preview with snap bottom sheets).
   - Rebuild Publish Desk (three-step stepper with interactive "Fix" jump actions).
   - Rebuild Settings & AI Sheet (grouped Android settings list, AI provider/test sheet).
4. **Verification & Proof:** Run full test suite (`npm test`), lint (`npm run lint`), build (`npm run build`), and verify live on the connected Samsung Galaxy S25 Ultra via ADB screencaps.
