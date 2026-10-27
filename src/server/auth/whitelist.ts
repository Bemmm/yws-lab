export interface WhitelistSubject {
  telegramId: bigint | number | string | null;
  phone: string | null;
}

function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Digits only with a leading "+". Returns null when no digits remain. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

/**
 * Methodologist role (specs/01-shared-access.md): Telegram ID or phone present in the env whitelist.
 * Evaluated on every request; never inferred from username or client input.
 */
export function isMethodologist(
  account: WhitelistSubject | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!account) return false;

  const ids = parseList(env.METHODOLOGIST_TELEGRAM_IDS);
  if (account.telegramId != null && ids.includes(String(account.telegramId).trim())) return true;

  const phone = normalizePhone(account.phone);
  if (phone) {
    const phones = parseList(env.METHODOLOGIST_PHONES)
      .map(normalizePhone)
      .filter((p): p is string => p !== null);
    if (phones.includes(phone)) return true;
  }
  return false;
}
