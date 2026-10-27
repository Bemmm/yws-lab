// Asserts WCAG contrast for every text/background pair the app uses, in both themes, straight from
// src/styles/tokens.css. Body text >= 4.5, large text / UI graphics >= 3. Run by `npm run lint`.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");

if (!css.includes("@media screen and (prefers-color-scheme: dark)")) {
  console.error("tokens.css has no `@media screen and (prefers-color-scheme: dark)` block");
  process.exit(1);
}
// Light = everything before the dark media block; dark = light overridden by the block's declarations.
const darkStart = css.indexOf("@media screen and (prefers-color-scheme: dark)");
const darkEnd = css.indexOf("@media print", darkStart);
const lightCss = css.slice(0, darkStart);
const darkCss = css.slice(darkStart, darkEnd < 0 ? undefined : darkEnd);
function parse(block) {
  const out = {};
  for (const d of block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) out[d[1]] = d[2].trim();
  return out;
}
const light = parse(lightCss);
const dark = { ...light, ...parse(darkCss) };

function resolve(theme, name, seen = new Set()) {
  if (name.startsWith("#")) return name; // literal colour (e.g. the asana line art, which is not a token)
  const v = theme[name];
  if (v === undefined) throw new Error(`unknown token ${name}`);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) {
    if (seen.has(name)) throw new Error(`token cycle at ${name}`);
    return resolve(theme, ref[1], seen.add(name));
  }
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name}: ${v} is not a #RRGGBB colour`);
  return v;
}
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const T = 4.5; // text
const U = 3; // large text and UI graphics
const SLOTS = ["amber", "emerald", "orange", "sky", "violet", "rose"];
/** [foreground, background, minimum, where it is used] */
const pairs = [
  ["--ink", "--bg-page", T, "body text on page"],
  ["--ink", "--bg-card", T, "text on cards, inputs, dialogs"],
  ["--ink-2", "--bg-page", T, "secondary text on page"],
  ["--ink-2", "--bg-card", T, "secondary text on cards"],
  ["--ink-2", "--line", T, "pending pill, muted nav count"],
  ["--ink-muted", "--bg-page", T, "hints, captions on page"],
  ["--ink-muted", "--bg-card", T, "hints, captions on cards"],
  ["--ink-muted", "--line", T, "locked chip"],
  ["--action-fg", "--action-bg", T, "primary button, active nav/tab, toggle knob, chips"],
  ["--action-fg", "--mint-ink", T, "rapid-growth pill"],
  ["--action-bg", "--bg-card", U, "toggle on, selected controls"],
  ["--inverse-fg", "--inverse-bg", T, "StatStrip, dark card"],
  ["--inverse-muted", "--inverse-bg", T, "StatStrip labels, dark card text"],
  ["--green-500", "--inverse-bg", T, "good stat value"],
  ["--white", "--brand-red", T, "accent button, nav count"],
  ["--white", "--brand-red-700", T, "accent button hover"],
  ["--focus", "--bg-page", U, "focus ring on page"],
  ["--focus", "--bg-card", U, "focus ring on cards"],
  ["--sand-ink", "--sand", T, "sand card, description"],
  ["--amber-ink", "--amber", T, "amber card, stagnation pill"],
  ["--mint-ink", "--mint", T, "steady pill"],
  ["--mint-ink", "--bg-card", T, "positive delta"],
  ["--red-ink", "--red-soft", T, "attention pill, danger button"],
  ["--red-ink", "--bg-card", T, "field error, negative delta"],
  ["--basic", "--basic-soft", T, "basic group pill"],
  ["--system", "--system-soft", T, "system group pill"],
  ["--basic", "--line", U, "skill bar fill (basic)"],
  ["--system", "--line", U, "skill bar fill (system)"],
  ["#1D1D1B", "--asana-bg", T, "asana SVG line art (school-owned, fixed dark ink) on its light tile"],
  ...SLOTS.map((s) => [`--slot-${s}-ink`, `--slot-${s}-band`, T, `${s} band text`]),
];

let failed = 0;
for (const [name, theme] of [["light", light], ["dark", dark]]) {
  for (const [fg, bg, min, use] of pairs) {
    const r = ratio(resolve(theme, fg), resolve(theme, bg));
    if (r < min) {
      failed++;
      console.error(`FAIL ${name}: ${fg} on ${bg} = ${r.toFixed(2)} (< ${min}) — ${use}`);
    }
  }
}
if (failed) {
  console.error(`\n${failed} contrast failure(s) in src/styles/tokens.css`);
  process.exit(1);
}
console.log(`contrast OK: ${pairs.length} pairs x 2 themes`);
