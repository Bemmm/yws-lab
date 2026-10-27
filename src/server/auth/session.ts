import "server-only";
import type { WhitelistSubject } from "./whitelist";

export interface CurrentAccount extends WhitelistSubject {
  id: string;
  name: string | null;
  username: string | null;
}

/** Stub until Telegram sign-in lands (YWSLAB-17): nobody is signed in yet. */
export async function getCurrentAccount(): Promise<CurrentAccount | null> {
  return null;
}
