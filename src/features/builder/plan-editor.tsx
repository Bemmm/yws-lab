"use client";

import { useCallback, useMemo, useRef } from "react";
import { disableShareAction, enableShareAction, savePlanAction } from "@/server/plans/actions";
import { BuilderClient, type ShareConfig } from "./builder-client";
import type { Program, SaveResult } from "./use-program";

/**
 * Wiring layer between the DI-shaped BuilderClient and the server actions: keeps the last known version
 * and sends it with every save, and maps server outcomes onto SaveResult.
 */
export function PlanEditor({
  planId,
  initialProgram,
  initialVersion,
  initialShareToken,
}: {
  planId: string;
  initialProgram: Program;
  initialVersion: number;
  initialShareToken: string | null;
}) {
  const versionRef = useRef(initialVersion);

  const save = useCallback(
    async (program: Program): Promise<SaveResult> => {
      const res = await savePlanAction(planId, program, versionRef.current);
      switch (res.status) {
        case "ok":
          versionRef.current = res.version;
          return { status: "ok" };
        case "conflict":
          return { status: "conflict" };
        case "not_found":
          return { status: "gone" };
        case "unauthorized":
          return { status: "unauthorized" };
        case "invalid":
          return { status: "invalid" };
        default:
          // Server-side failure: surface as a thrown error so the autosaver retries with backoff.
          throw new Error("save failed");
      }
    },
    [planId],
  );

  const share = useMemo<ShareConfig>(
    () => ({
      initialToken: initialShareToken,
      enable: (id) => enableShareAction(id),
      disable: (id) => disableShareAction(id),
    }),
    [initialShareToken],
  );

  return (
    <BuilderClient
      initialProgram={initialProgram}
      save={save}
      share={share}
      previewHref={(id) => `/plans/${id}/preview`}
      backHref="/plans"
    />
  );
}
