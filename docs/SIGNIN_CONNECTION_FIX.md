# ALLERT sign-in connection check follow-up

Apply this small patch **after** `ALLERT_release_completion.patch`, on the existing `feature/app-release-completion` branch.

## What happened

The old login-page banner made one `/health` request and labelled every failed fetch, non-200 response or unreadable response as “Sign-in service unavailable.” The public health check also sent an unnecessary Authorization header, which adds a cross-origin preflight request.

Your direct health URL returned `status: ok` and the app later recovered. That confirms the function was reachable at that moment. It does not identify the exact original browser/network failure or prove every sign-in request succeeded. A health endpoint is a liveness check, not an authentication test.

## Changes

- The public health request sends no Authorization header or cookies. This removes the unnecessary authorization-header preflight; normal browser CORS rules still apply.
- Each health request has a 10-second deadline through the existing older-Safari-compatible request helper.
- Network errors, timeouts, HTTP 408 and server errors receive up to three checks, with 1- and 3-second pauses. If still unconfirmed, a fresh check starts after 30 seconds.
- Browser offline state is shown separately. Reconnecting immediately checks again. The browser's offline indicator is advisory; a device can report online while its internet path is unavailable.
- HTTP 401/403/404/429 and unexpected response content stay visible and can be retried manually. They do not trigger a continuous background retry loop. Focus can recheck after 30 seconds.
- A failed check says “Connection check could not finish,” not a confirmed sign-in outage. A healthy response removes the banner.
- Overlapping manual requests are prevented; unmount cancels work and removes listeners. Late responses after an offline/reconnect transition cannot restore outdated state.
- The login form, logo, layout, authentication checks and session storage are retained. No automatic credential submissions, sign-outs, account changes, database edits or model calls are added.

This improves recovery from temporary request failures. It cannot guarantee uninterrupted internet service or repair a persistent DNS, VPN, extension, firewall, CORS or server issue. A successful public health response does not validate the sign-in endpoint.

## Apply in PowerShell

Save `ALLERT_signin_connection_fix.patch` in:

```text
D:\Lenovo\Documents\Programming\.vscode\Allert
```

Stay on `feature/app-release-completion`; the previous release patch must already be applied. Preserve the current app work and your separate firmware modification.

```powershell
git apply --check --ignore-space-change --ignore-whitespace ALLERT_signin_connection_fix.patch
```

If no error is printed:

```powershell
git apply --ignore-space-change --ignore-whitespace ALLERT_signin_connection_fix.patch
npm test
npm run build
```

Expected after this supplement: **614 tests passed, zero failures**, and a successful production build. The count includes the earlier 595 tests and 19 new health/recovery tests.

No Supabase SQL, Edge Function redeployment, new secret, Render change or node firmware upload is required. This is a frontend update. The Vercel app receives it after the branch is reviewed, merged and deployed through the normal workflow.

## Verify locally

1. Start `npm run dev`, open the displayed local URL, and reload. With a healthy public endpoint, the connection banner disappears. Sign in normally and verify your dashboard/diary.
2. In Chrome DevTools → Network, filter `health`. The request should be a GET without an Authorization request header. A successful response contains `status: ok`.
3. On the login page, switch DevTools Network to Offline. Confirm an offline message. Restore No throttling/online and confirm the check automatically recovers without re-entering account details or reloading the whole app. Restore the network setting before testing login.
4. For a longer failure test, use DevTools request blocking on the exact health URL only. Confirm three bounded attempts, the unconfirmed-connection message and a later recovery check. Remove the blocking rule and click Check again or allow the next scheduled check. Do not leave a blocking rule enabled.
5. Only health GET requests retry automatically. Credential POST requests are not replayed by this change.
6. Verify the deployed Vercel app after merging. A local change does not update the deployed site by itself.

If a failure persists, capture the failed request's URL, status and response, plus the first relevant Console error. Never share Authorization headers, passwords, cookies, private keys, full HAR exports or request payloads. If health is healthy but login fails, inspect the actual `/login` request separately.

## Files in this supplement

- `src/app/components/DeploymentCheck.tsx`
- `src/app/utils/service-health.ts`
- `src/app/utils/useServiceHealth.ts`
- `integration/service-health.test.mjs`
- `docs/SIGNIN_CONNECTION_FIX.md`

Include these files in the existing release PR after checks pass. Keep the separate firmware edit out of the app commit until its diff is reviewed.

## Verification performed

The implementation was checked with React component/hook tests and fake network transport for public header-free requests, offline state, timeouts, network stream failures, malformed responses, retry limits, automatic recovery, stale responses, simultaneous manual retries and unmount cancellation. The full app regression suite and production build also passed. Patch application was checked against the already-applied release source.

The original live browser fetch failure was not reproduced by the patch author. The recovery code and message correction are verified locally; real deployment/browser acceptance is still required.
