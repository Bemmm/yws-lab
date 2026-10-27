import { z } from "zod";
import type { SaveMeta } from "./service";

/** Shared by the server action and the keepalive route: the shape of the save envelope (document is validated separately). */
export const MAX_UNACKED_SAVE_IDS = 10;
const saveId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

const metaSchema = z.object({
  saveId,
  unackedSaveIds: z.array(saveId).max(MAX_UNACKED_SAVE_IDS),
});

/** `undefined` -> no meta (legacy caller); `null` -> malformed meta (answer `invalid`). */
export function parseSaveMeta(raw: unknown): SaveMeta | undefined | null {
  if (raw === undefined) return undefined;
  const r = metaSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export const keepaliveBodySchema = z.object({
  document: z.unknown(),
  expectedVersion: z.number().int().min(1),
  meta: metaSchema,
});
