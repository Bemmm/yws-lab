# YWS-Lab 1.0 design system

- ID: f2f31bba-28c1-4a4e-a6fd-9cf7eab3bc9c
- Version: 1
- Updated: 2026-10-27T09:18:52.887267Z
- Linked tasks: None

---

# YWS-Lab 1.0 design system

Status: design system v1, 27 October 2026. Based on [reference audit and logo choice](https://tasksurfing.app/?document=2a768d86-e216-45ed-ba24-99de8fa48ddf). Product specs: [builder](https://tasksurfing.app/?document=f7b9e0ac-43b2-450e-919b-290a39e664ae), [progress](https://tasksurfing.app/?document=4b22c089-7e06-45ab-95cd-6953c9ca41e7), [access](https://tasksurfing.app/?document=247c49d2-5916-4848-8b94-4bab36ed3f1a).

## 1. Principles
1. **Calm working surface.** White and soft neutral backgrounds hold dense editing and assessment content. Gradient and high-color fields identify entry points and summaries.
2. **Strong hierarchy.** Large headings, brief helper text and clear actions borrow the reference site's confident visual rhythm.
3. **One obvious next action.** Each page has a primary action; secondary operations sit nearby without competing for attention.
4. **Readable progress.** Every score, change and status has text/numbers; color provides reinforcement.
5. **Same system across roles.** Regular accounts and methodologists share navigation, controls and typography. Progress appears only when authorized.

## 2. Brand and logo
Selected logo: **Interwoven Knot Emblem with Red Lab Wordmark.png**. Use it on the dark navigation surface at 36–48 px visible emblem height or on the sign-in panel at 120–180 px. Preserve its aspect ratio and clear space of at least one quarter of its visible width. Use a text wordmark in narrow navigation. Do not place the raster logo on a busy gradient, stretch it, recolor it or rely on it at favicon size. Prepare a simplified small-size mark before a favicon is needed.

## 3. Color tokens
Use semantic tokens in code; these hex values are the 1.0 baseline.

| Token | Value | Use |
|---|---|---|
| canvas | `#F6F7F8` | app background |
| surface | `#FFFFFF` | cards, forms, panels |
| surface-soft | `#F0F2F5` | secondary groups |
| nav | `#17181C` | navigation, main CTA |
| text | `#17181C` | primary text |
| text-muted | `#60636E` | helper text |
| border | `#E1E4E8` | inputs, dividers |
| brand-red | `#B40C2B` | small brand accents, selected logo relation |
| focus | `#5A48B8` | focus ring, selected controls |
| basic | `#0C6B70` | basic competency group |
| system | `#5A48B8` | YWS system competency group |
| positive | `#165D38` | growth status |
| attention | `#B42318` | attention/error |
| caution | `#9C5A00` | stagnation/warning |

All listed text/status colors have at least 4.5:1 contrast on white; text and text-muted are about 17.7:1 and 6.0:1. White text on nav, brand-red, basic, system, positive and attention also exceeds 4.5:1. Use tinted backgrounds with the dark matching foreground; do not put white text over a pale gradient.

Ambient gradient for sign-in and occasional summary header: `#5035A9 → #4377D4 → #8FD9D1`. Place text on an opaque surface or test contrast at every stop. Red from the logo is never the sole indicator of a destructive action.

## 4. Typography
Use a self-hosted, licensed sans-serif family with broad Cyrillic support; **Inter** is the baseline. Font stack: Inter, system-ui, sans-serif. Headings use weight 700–800, UI/body 400–600, numeric data uses tabular figures. Avoid decorative fonts in assessment screens.

| Style | Desktop | Mobile | Line height |
|---|---|---|---|
| Page title | 36 px / 750 | 28 px / 750 | 1.15 |
| Section title | 24 px / 700 | 22 px / 700 | 1.25 |
| Card title | 18 px / 700 | 18 px / 700 | 1.3 |
| Body | 16 px / 400 | 16 px / 400 | 1.5 |
| Secondary | 14 px / 500 | 14 px / 500 | 1.45 |
| Label | 13 px / 650 | 13 px / 650 | 1.35 |
| Metric | 28–40 px / 750 | 24–32 px / 750 | 1.1 |

Use sentence case and short Ukrainian labels. Do not truncate competency labels without a full-name tooltip or accessible name. Preserve user-authored text as entered.

## 5. Spacing, shape and elevation
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64 px. Layout uses 8 px rhythm; dense form controls may use 4 px internal spacing.
- Card radius 20 px; input/button radius 12 px; large modal/sheet radius 24 px; small badge radius 999 px.
- Border 1 px. Subtle shadow only for elevated popovers, dialogs and selected hero cards; ordinary cards rely on border and surface contrast.
- Tap target at least 44 × 44 px; visible focus outline 2 px with offset. Hover changes never substitute for focus/pressed states.
- Motion 150–220 ms for panels and state changes; respect reduced-motion preference and keep score changes understandable without animation.

## 6. App shell and responsive grid
- Desktop ≥ 1200 px: 248 px dark left navigation, 72 px top bar, content max width 1240 px, page side padding 32–48 px. Builder editor uses a flexible 2-column grid with 320–360 px catalog panel. Progress cohort cards use 2–3 columns.
- Tablet 768–1199 px: compact 72 px navigation rail or top navigation; content side padding 24 px; builder catalog becomes a slide-over. Assessments remain one readable column or two groups if space permits.
- Mobile < 768 px: 16 px side padding, top bar and bottom navigation/drawer; cards in one column. Builder catalog is a bottom sheet. Assessment actions remain reachable while scrolling. History table scrolls horizontally with a sticky label column.
- Never make the whole page scroll sideways at 375 px. Charts and tables own their overflow region.

Navigation: **Training plans** for all accounts; **Student progress** only for methodologists; account menu with sign-out. A direct unauthorized URL resolves to a non-disclosing state.

## 7. Components and states
| Component | Required behavior |
|---|---|
| Primary button | dark fill, white label; loading spinner plus persistent label; disabled includes reason when useful |
| Secondary button | white surface, dark label and border |
| Destructive action | attention text/border, confirmation for data loss; distinguish from brand red |
| Input/textarea | label above, helper/error below, character count where specified |
| Select/search | keyboard navigation, clearable search, no hidden-only labels |
| Segmented control/tabs | selected state by fill/shape and text, keyboard support |
| Card | clear title, summary and direct action; use consistent internal spacing |
| Badge/status | text label plus optional icon and tint; never color alone |
| Dialog | focus trap, Escape/Cancel, explicit destructive copy; return focus on close |
| Toast/status line | success/errors announced to screen readers; persistent errors stay visible |
| Empty/loading/error | explain next action; skeletons resemble final layout and avoid fake data |

Builder-specific patterns: section cards with drag handle plus menu actions; exercise row with catalog image/name, duration-or-breath field and note; persistent autosave status; link dialog with Copy and Revoke. Progress-specific patterns: cohort header with module chips and **Manage modules**; teacher-student cards; 16-score assessment form; metric tiles; group summary; competency scale; stage history table.

## 8. Data visualization
Basic competencies use teal; YWS system competencies use violet. The same mapping appears in cards, scales, history and legend. Attention is red with reason text; stagnation is amber; growth is green with label. Each scale has a 0–10 numeric value and text alternative. Mini-charts share a 0–10 vertical range. Missing data uses an em dash and “not assessed” explanation; zero is displayed as 0, never as blank.

Group summary shows denominators next to averages and counts. Filters do not alter summary totals. Avoid student ranking visuals, leaderboards and celebratory judgment of scores.

## 9. Accessibility and content checks
- WCAG 2.2 AA target: contrast, keyboard operation, focus visibility, input labels, error identification, status announcements and logical reading order.
- Drag-and-drop always has Move up/Move down controls. Sliders have linked number inputs and keyboard support.
- Mobile assessment form has one competency per row and sticky Save/Cancel action area that does not cover fields.
- Sensitive progress data is never placed in public metadata, share previews or analytics. Public builder share pages use the same typography/content system without app navigation.
- Initial interface copy is Ukrainian per the shared spec; localization keys and flexible components support later languages.

## 10. Design deliverables and approval gate
Before UI implementation, produce annotated screen layouts for sign-in, plan library/editor/preview/public link, cohort overview/manage modules, teacher-student profile/assessment/history, and shared empty/error/unauthorized states. Verify at desktop 1440 px and mobile 375 px; assess key tablet states at 768 px. Check the chosen logo in final navigation/sign-in layouts. The reference screenshots stay local and untracked until these layouts are validated, then are removed from the repo workspace.

