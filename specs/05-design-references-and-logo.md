# Design reference audit and logo decision

- ID: 2a768d86-e216-45ed-ba24-99de8fa48ddf
- Version: 1
- Updated: 2026-10-27T09:17:59.857846Z
- Linked tasks: None

---

# Design reference audit and logo decision — YWS-Lab 1.0

Date: 27 October 2026. Source assets: 24 Monobank page screenshots in the temporary local `references/` folder and two YWS-Lab logo PNGs in the repository root.

## Reference patterns observed
- Large, confident sans-serif headings with short supporting copy.
- Wide white or very pale sections and substantial spacing between groups.
- Bright gradient fields, usually violet/blue/teal, used for major moments rather than every card.
- Compact black cards and pill-like dark actions that create strong contrast against pale sections.
- Rounded surfaces, soft shadows and product mockups used to establish depth.
- Colorful small illustrations/badges used sparingly within otherwise quiet pages.

These are public marketing pages. In the working app, carry their clarity and contrast into a light content canvas, dark navigation, strong typography and a few colored summary panels. Keep forms, tables and assessment data on plain surfaces for sustained reading.

## Logo comparison and decision
- **Selected:** `Interwoven Knot Emblem with Red Lab Wordmark.png`.
- The red wordmark remains legible on pale surfaces where the white-wordmark variant nearly disappears, while the white emblem and red wordmark are both recognizable on the planned dark navigation surface.
- Use the full logo in the sign-in screen, app navigation and branded empty states at a size where the woven detail is clear. Use a plain text “YWS Lab” label in the most compact navigation state; the raster emblem loses clarity at tiny sizes.
- The logo file remains a source asset for now. Before release, export production-sized assets and inspect transparency, edge quality and file size. Do not use the white-wordmark variant in 1.0 unless a specific dark-only placement is justified.

## Direction for the app
- Light canvas with white functional cards; dark charcoal navigation/header; restrained violet/blue ambient gradients on onboarding and summary headers.
- Brand red from the chosen logo is a small identity accent. Dark charcoal is the default main action. Teal and violet distinguish the two competency groups; red is also used for attention/destructive states with text labels.
- Responsive layout favors a wide editor and readable assessment cards. Mobile keeps essential actions visible and moves secondary controls into drawers/sheets.
- Charts and score scales carry numeric labels and text summaries, not color alone.

## Asset handling
The screenshots are design references, not product artwork. They are untracked and must not be committed or deployed. Keep them locally until the screen designs are validated, then remove the temporary `references/` folder as requested. The two logo candidates remain outside the production asset path until the chosen variant has been prepared.

