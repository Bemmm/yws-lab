# Methodologist access operations

Set a long, randomly generated base64url `OPERATOR_KEY` (at least 32 characters) as a deployment secret. Use a separate secret from `SESSION_SECRET`; do not put it in source control, URLs, shell history, tickets, or logs. The endpoint accepts the shared operator credential, so audit records identify the actor as `operator_key`, not an individual person. Restrict access to the secret to authorized operators and rotate it when access changes.

Use the stable Telegram OIDC **subject** for the account, not the username. Confirm the subject through an authorized out-of-band process before changing access. It may be granted before the person first signs in. A revoke removes the whitelist entry and all current sessions for the matching account atomically; the person can sign in again for their plans, without progress access. Every request checks the current whitelist.

From a trusted terminal, load `OPERATOR_KEY` securely into the environment without entering it in shell history. Set `APP_ORIGIN` to the deployed HTTPS origin and `TELEGRAM_SUBJECT` to the verified numeric subject. Then run:

```sh
curl --config - <<CONFIG
url = "$APP_ORIGIN/api/operator/whitelist"
request = "POST"
header = "x-operator-key: $OPERATOR_KEY"
header = "content-type: application/json"
data = "{\"telegramSubject\":\"$TELEGRAM_SUBJECT\",\"action\":\"grant\"}"
fail-with-body
silent
show-error
CONFIG
```

Use `"revoke"` in place of `"grant"` to remove access. The credential is supplied through standard input instead of a command argument. Do not run this command with shell tracing enabled or on a shared machine where environment variables can be observed. Unset the key from the terminal environment after use. A successful operation returns `{"ok":true}`. Repeating either operation is safe; each request is recorded in the audit log. The endpoint never returns roster or assessment data.
