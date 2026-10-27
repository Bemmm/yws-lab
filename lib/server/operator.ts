/** Compare via Web Crypto's constant-time MAC verification, including different-length inputs. */
export async function validOperatorKey(provided: string | null, expected: string | undefined) {
  if (!expected || expected.length < 32 || !provided || provided.length > 1024) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(expected), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(expected));
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(provided));
}
