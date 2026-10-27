import { AppShell } from "@/components/AppShell";

/** Neutral placeholders shaped like the final layout; never sample data. */
export default function Loading() {
  return (
    <AppShell active="progress">
      <div className="p-page" role="status" aria-busy="true">
        <div className="p-skel" style={{ minHeight: 48, maxWidth: 360 }} />
        <div className="p-skel" style={{ minHeight: 160 }} />
        <div className="p-cards">
          <div className="p-skel" style={{ minHeight: 240 }} />
          <div className="p-skel" style={{ minHeight: 240 }} />
          <div className="p-skel" style={{ minHeight: 240 }} />
        </div>
      </div>
    </AppShell>
  );
}
