import { NextResponse } from "next/server";
import { getSql } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getSql()`select 1`;
    return NextResponse.json({ ok: true, db: true });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
}
