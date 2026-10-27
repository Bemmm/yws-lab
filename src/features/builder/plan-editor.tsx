"use client";

import { useMemo, useState } from "react";
import { disableShareAction, enableShareAction, savePlanAction } from "@/server/plans/actions";
import { BuilderClient, type ShareConfig } from "./builder-client";
import { createSaveClient } from "./save-client";
import type { Program } from "./use-program";

/**
 * Wiring layer between the DI-shaped BuilderClient and the server actions: keeps the last known version
 * and save ids (see save-client.ts) and sends them with every save, and maps server outcomes onto SaveResult.
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
  // Created once per mount (like the former version ref): later prop changes must not reset the version bookkeeping.
  const [client] = useState(() =>
    createSaveClient({ planId, initialVersion, action: (id, doc, v, meta) => savePlanAction(id, doc, v, meta) }),
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
      save={client.save}
      saveOnHide={client.saveOnHide}
      share={share}
      previewHref={(id) => `/plans/${id}/preview`}
      backHref="/plans"
    />
  );
}
