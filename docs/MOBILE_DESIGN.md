# ESB Studio Phone: Mobile Product Design Specification

**Document Version:** 1.0  
**Target Hardware:** Samsung Galaxy S25 Ultra (`SM-S938B`, 1440 × 3120 physical, 411.4 × 891.4 CSS dp @ 3.5x DPR, 19.5:9)  
**Reference Workstation:** ESB AI Studio (Desktop Electron)  
**Design Philosophy:** Mobile-native from first principles; unified brand identity; calm, modern, and ergonomic.

---

## 1. Ergonomics & One-Handed Reach (Thumb-First)

### 1.1 Viewport Zoning (411.4 × 891.4 dp)
- **Thumb Zone (Bottom 35% ~ 580 to 891 dp):**
  - Primary bottom navigation (Home, Edit, Banner, Publish).
  - Floating Action Buttons (Extended FAB: "New Story").
  - Primary action buttons ("Start story", "Translate", "Publish").
  - Bottom sheet triggers and drag handles.
  - Keyboard accessory strip when typing.
- **Content & Interaction Zone (Middle 45% ~ 180 to 580 dp):**
  - Reading text, editing paragraphs, reviewing facts.
  - Banner canvas preview (sized to 16:9 / 4:5 without starving lower controls).
  - List cards and form inputs.
- **Status & Reference Zone (Top 20% ~ 0 to 180 dp):**
  - Small Top App Bar (Title, Drawer Burger, AI status chip, Theme toggle).
  - Non-interactive status readouts, safe-area camera cutout padding.

### 1.2 Touch Targets & Spacing Rules
- **Minimum Interactive Hit Area:** $48 \times 48\text{ dp}$ (visual element may be 40 or 44 dp with transparent hit padding).
- **Minimum Gap Between Adjacent Targets:** $8\text{ dp}$.
- **Modality Preference:** Modal bottom sheets (with drag handle, backdrop scrim, and snap points) replace desktop popovers, centered dialogs, and nested menus.

---

## 2. Spacing Scale & Typography (4 dp Grid)

### 2.1 Spacing Scale (Tokens)
All layout dimensions MUST map directly to the 4 dp grid:
```css
--sp-1: 4px;   /* Micro spacing, borders */
--sp-2: 8px;   /* Icon-to-label, intra-chip gap */
--sp-3: 12px;  /* Intra-card elements, form field gap */
--sp-4: 16px;  /* Page gutter, card padding, list item padding */
--sp-5: 20px;  /* Section sub-headers */
--sp-6: 24px;  /* Major section spacing */
--sp-7: 32px;  /* Screen header bottom clearance */
--sp-8: 48px;  /* Bottom dock clearance */
--sp-9: 64px;  /* Floating action clearances */
```

### 2.2 Typography Scale
- **Display (Hero headlines):** Inter 700, 26px / 32px (Bangla: Hind Siliguri 700, 26px / 40px)
- **Title (Card & Section headers):** Inter 600, 18px / 24px (Bangla: 18px / 28px)
- **Body (Reading & Editorial text):** Inter 400/500, 16px / 24px (Bangla: Hind Siliguri 400/500, 16px / 26px, line-height 1.6)
- **Label (Buttons, Tabs, Chips):** Inter 600, 13px / 18px
- **Caption (Timestamps, Counters, Notes):** Inter 500, 12px / 16px

---

## 3. Navigation Model Decision & Rationale

### 3.1 Chosen Architecture: Hybrid Bottom Navigation + Navigation Drawer (Burger)
We adopt a **4-item Bottom Navigation Bar** complemented by a **Top-Left Navigation Drawer**:
1. **Primary Navigation (Bottom Bar):**
   - **Home (Launcher & Stories Queue):** Entry point, recent stories list, quick intake FAB.
   - **Edit (Editorial Desk):** Source/English translation, fact-checking, SEO, readiness.
   - **Banner (Graphics Desk):** 4 sizes, templates, photo framing, highlight, export/share.
   - **Publish (Review & Gate):** Readiness checklist, site/Facebook preview, 2-tap gate.
2. **Secondary Destinations (Navigation Drawer via top-left Burger):**
   - Profile & Connection Status (Supabase session, CMS status).
   - Settings (AI keys, Facebook Page token, biometric lock).
   - About & Version info.
   - Help & Newsroom Guidelines.

### 3.2 Rationale
- **Why not 5+ bottom tabs?** 4 items allocate ~102 dp width per item on a 411 dp display, providing comfortable, distinct hit targets without label cramping.
- **Why a Navigation Drawer for Settings?** Settings, credentials, and account details are infrequent maintenance tasks. Moving them out of the primary bottom rail prevents clutter and leaves the bottom zone entirely dedicated to daily publishing workflows.
- **System Back Integration:** Android predictive back pops the top-most layer in order:
  1. Active open bottom sheet / drawer $\rightarrow$ 2. Editorial intake sub-view $\rightarrow$ 3. Return to Home tab $\rightarrow$ 4. Minimize app.

---

## 4. Component Kit Architecture (`src/ui/kit/`)

A dedicated mobile component kit built with React 19 and typed props:
- **`TopAppBar`:** Compact 52 dp header with navigation drawer icon (burger), title, AI status chip, and theme toggle.
- **`BottomNav`:** 4-tab bar with animated indicator pill, touch feedback, and badge support.
- **`NavDrawer`:** Android-style modal sliding drawer with ESB branding, account status, destinations, and version info.
- **`BottomSheet`:** Spring-animated bottom sheet with drag handle, backdrop scrim, header, and dismiss-on-swipe.
- **`Button`:** Filled primary (48 dp), Tonal secondary, Outlined, and Destructive variants.
- **`ExtendedFAB`:** Bottom-right floating action button for "New Story" with icon and text.
- **`TextField` & `TextArea`:** Outlined/filled variants with floating labels, character count badge, error state, and `resize: none`.
- **`SelectSheet`:** General-purpose bottom sheet picker replacing native dropdowns, with optional color dots and search.
- **`StatusChip`:** Compact badges for story statuses (Draft, Translated, Ready, Published) and categories.
- **`AccessoryBar`:** Slim strip docked above the mobile keyboard during editing (undo, redo, paragraph split/merge, find).

---

## 5. Screen Layout Specifications (ASCII Wireframes)

### 5.1 Home (Launcher)
```
+----------------------------------------------------+ [StatusBar: 36dp]
| [=] ESB AI STUDIO           [✨ Gemini] [☼]        | [TopAppBar: 52dp]
+----------------------------------------------------+
|  [ ESB POWER LINE | Ai Studio ] (Compact Hero)     |
|  "Where stories are written..."                     |
+--------------------------+-------------------------+
| [   Editorial Desk     ] | [    Graphics Desk    ] | (Balanced 1:1 Tiles)
|  Link in, English out    |  Banners and cards      |
+--------------------------+-------------------------+
| Recent Stories                                     |
| [Q Search stories...]                              |
| +------------------------------------------------+ |
| | [Card] BPDB Signs 50MW Solar Deal...           | |
| | [DRAFT] [Renewables] 2m ago                [:] | |
| +------------------------------------------------+ |
|                                                    |
|                              [ + New Story (FAB) ] |
+----------------------------------------------------+
| CMS • Connected  |  ENGINE • Gemini  | 0w          | [StatusStrip: 30dp]
+----------------------------------------------------+
|   [Home]*        [Edit]        [Banner]  [Publish] | [BottomNav: 56dp]
+----------------------------------------------------+ [NavBar: 15dp]
```

### 5.2 Edit Desk (Writing & Paragraph Tools)
```
+----------------------------------------------------+
| [<-] Story: Cox's Bazar Deal...            [✨] [:] |
+----------------------------------------------------+
| [ < ] Undo  [ > ] Redo | [ Bangla (1) ] [ English* ]|
+----------------------------------------------------+
| [ Headline Input (0/104)                          ]|
| [ Deck Input (0/200)                              ]|
| [ Category Sheet: Renewables                   [v] ]|
|                                                    |
| Paragraph 1:                                       |
| [ The Bangladesh Power Development Board...       ]|
|                                                    |
| Paragraph 2:                                       |
| [ Officials said the tariff has been agreed...    ]|
|                                                    |
| [ Bottom padding 80dp so dock never obscures ]     |
+----------------------------------------------------+
| (4) Ready | [ Translate Story ] | Banner | Publish | [Docked Actions: 64dp]
+----------------------------------------------------+
|   [Home]         [Edit]*       [Banner]  [Publish] |
+----------------------------------------------------+
```

### 5.3 Banner Desk (Graphics)
```
+----------------------------------------------------+
| [=] Banner Studio                          [✨] [:] |
+----------------------------------------------------+
| +------------------------------------------------+ |
| | [ Canvas Preview: 4:5 Feed ]                   | |
| |   (Scaled to fit top ~42% without overflow)    | |
| |                                                | |
| |   [ESB Logo]                      [Date Badge] | |
| |   "BPDB Signs 50MW Solar Deal"                 | |
| |   [Social Footer Strip]                        | |
| +------------------------------------------------+ |
| [ Move Photo ]    [ Zoom View ]    [ Reset Frame ] |
+----------------------------------------------------+
| [ Text* ]  [ Template ]  [ Size ] [ Photo ] [Export| [Tool Tabs: 44dp]
+----------------------------------------------------+
| Headline:                                          |
| [ BPDB Signs 50MW Solar Deal                     ] |
| Style: [ Colour ]  [ Marker ]  [ Underline* ]      |
| Category: [ Renewables                         [v] ]|
+----------------------------------------------------+
|   [Home]         [Edit]        [Banner]* [Publish] |
+----------------------------------------------------+
```

---

## 6. What Was Deliberately Dropped from PC & Why

1. **Multi-Column Desks (3-column layout):** PC shows Source, English Editor, and Fact Map side by side. On a 411 dp screen, this is impossible. We use a high-speed segmented toggle (`Bangla Source` vs `English Copy`) with preserved scroll positions and slide-up sheets for Fact Verification and SEO.
2. **Permanent Heavy Status Bar with Multiple Counters:** Simplified to a slim, quiet 30 dp telemetry bar with tap-to-inspect details.
3. **Desktop Mouse Hover Menus & Tooltips:** Replaced by clear visual indicators and bottom action sheets.
4. **Desktop Textarea Resize Grips:** Suppressed (`resize: none`) in favor of dynamic content auto-expansion.
5. **Video & Outreach Desks:** Kept strictly out of mobile scope (heavy render queue and mail infrastructure belong on desktop).

---

## 7. Verification Matrix

- **Unit & Component Testing:** All existing 171 tests passing; new tests covering `kit/` components.
- **Lint & Build Gates:** Strict TypeScript compilation (`tsc -b`), zero Oxlint warnings, zero bundle bloat.
- **Real Phone Live Screen Captures:** Every rebuilt screen captured on the connected Galaxy S25 Ultra over ADB in light, dark, and landscape orientations before marking complete.
