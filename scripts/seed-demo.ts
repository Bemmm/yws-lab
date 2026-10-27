/**
 * Demo data for local / staging use ONLY: cohort "Демо-потік" with modules 1-5 and five students with
 * different starting profiles and dynamics (rapid, steady, stagnation, attention, only Point 0 + a partial stage).
 *
 *   DATABASE_URL=postgres://... npm run db:seed-demo
 *
 * Refuses to run when NODE_ENV=production. Safe to re-run: does nothing if the demo cohort already exists.
 * Goes through the real service layer, so every score is validated and audited like a normal save.
 */
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { runMigrations } from "./migrate.mjs";
import { COMPETENCY_CODES } from "../src/server/progress/competencies";
import type { StartingProfile } from "../src/server/progress/service";

const COHORT_NAME = "Демо-потік";
const SEED_TELEGRAM_ID = -1n; // internal actor for audit rows; not whitelisted, cannot sign in

/** 9 basic scores then 7 system scores, in the fixed competency order. */
const scores = (basic: number[], system: number[]) =>
  Object.fromEntries(COMPETENCY_CODES.map((code, i) => [code, i < 9 ? basic[i]! : system[i - 9]!]));
const basicOnly = (basic: number[]) => Object.fromEntries(COMPETENCY_CODES.slice(0, 9).map((code, i) => [code, basic[i]!]));

interface Demo {
  name: string;
  profile: StartingProfile;
  stages: Record<string, Record<string, number>>;
}

const DEMO: Demo[] = [
  {
    // Rapid growth (last step +2.0).
    name: "Олена Коваленко",
    profile: "polishing",
    stages: {
      point0: scores([6, 6, 5, 6, 7, 6, 6, 5, 6], [5, 5, 6, 5, 6, 5, 5]),
      m1: scores([7, 7, 6, 7, 7, 7, 7, 6, 7], [7, 6, 7, 6, 7, 6, 6]),
      m2: scores([9, 9, 8, 9, 9, 9, 9, 8, 9], [9, 8, 9, 8, 9, 8, 8]),
    },
  },
  {
    // Steady growth.
    name: "Андрій Мельник",
    profile: "reframing",
    stages: {
      point0: scores([4, 5, 3, 4, 5, 4, 4, 3, 4], [3, 3, 4, 3, 3, 4, 3]),
      m1: scores([5, 5, 4, 5, 5, 5, 5, 4, 5], [4, 4, 5, 4, 4, 4, 4]),
      m2: scores([5, 6, 5, 5, 6, 5, 5, 4, 5], [5, 4, 5, 4, 5, 5, 4]),
    },
  },
  {
    // Stagnation (+0.06 on the last step).
    name: "Марина Шевченко",
    profile: "from_zero",
    stages: {
      point0: scores([2, 2, 1, 2, 3, 2, 2, 2, 2], [1, 1, 2, 1, 1, 2, 1]),
      m1: scores([2, 3, 2, 2, 3, 2, 2, 2, 2], [2, 1, 2, 1, 1, 2, 1]),
      m2: scores([2, 3, 2, 2, 3, 2, 2, 2, 2], [2, 1, 2, 1, 2, 2, 1]),
    },
  },
  {
    // Attention: overall level still up, but "Впевненість" fell by 3.
    name: "Ігор Бондаренко",
    profile: "polishing",
    stages: {
      point0: scores([7, 6, 7, 6, 7, 6, 6, 5, 6], [6, 6, 7, 6, 6, 6, 6]),
      m1: scores([7, 7, 7, 7, 7, 6, 7, 6, 7], [7, 7, 7, 6, 7, 6, 7]),
      m2: scores([8, 7, 4, 7, 8, 7, 8, 6, 8], [7, 7, 7, 7, 7, 7, 7]),
    },
  },
  {
    // Only Point 0 complete (with real zeros) and a partly assessed module 1 (9 of 16).
    name: "Софія Ткаченко",
    profile: "from_zero",
    stages: {
      point0: scores([1, 2, 1, 2, 2, 1, 1, 1, 2], [0, 1, 1, 0, 1, 1, 0]),
      m1: basicOnly([2, 3, 2, 3, 3, 2, 2, 2, 3]),
    },
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("seed-demo: refusing to run with NODE_ENV=production (demo data is for local/staging only).");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("seed-demo: DATABASE_URL is not set");
    process.exit(1);
  }

  await runMigrations(url);
  const svc = await import("../src/server/progress/service");
  const { getDb, getSql } = await import("../src/server/db/client");
  const { account, cohort } = await import("../src/server/db/schema");
  const db = getDb();

  const [existing] = await db.select({ id: cohort.id }).from(cohort).where(eq(cohort.name, COHORT_NAME));
  if (existing) {
    console.log(`seed-demo: cohort "${COHORT_NAME}" already exists (${existing.id}); nothing to do.`);
    await getSql().end();
    return;
  }

  const [actor] = await db
    .insert(account)
    .values({ telegramId: SEED_TELEGRAM_ID, name: "Demo seed" })
    .onConflictDoUpdate({ target: account.telegramId, set: { name: "Demo seed" } })
    .returning({ id: account.id });
  const actorId = actor!.id;

  const must = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }, what: string): T => {
    if (!r.ok) throw new Error(`seed-demo: ${what} failed: ${JSON.stringify(r.error)}`);
    return r.value;
  };

  const c = must(await svc.createCohort({ name: COHORT_NAME, modules: [1, 2, 3, 4, 5] }, actorId), "createCohort");
  for (const d of DEMO) {
    const e = must(
      await svc.enroll({ cohortId: c.id, student: { newStudent: { displayName: d.name } }, startingProfile: d.profile }, actorId),
      "enroll",
    );
    for (const stage of ["point0", "m1", "m2", "m3", "m4", "m5", "final"]) {
      const s = d.stages[stage];
      if (s) must(await svc.saveStage(e.id, stage, s, 0, actorId), `saveStage ${stage}`);
    }
  }
  console.log(`seed-demo: created "${COHORT_NAME}" (${c.id}) with modules 1-5 and ${DEMO.length} students.`);
  await getSql().end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
