# One private node link for the family

Base: merged main `fce9a42f9dd7bda88363655e0f9c2a075c92f317` (clinical/ownership/mobile batch already installed).

## What is added

The owner creates one private link in **Settings → Node Setup → Family sharing**. The same link can be used by several household members. A member opens it, signs in or creates their own ALLERT account, completes onboarding if required, and explicitly confirms **Join shared node**.

There is no automatic expiry and no per-person invitation. The link remains reusable until the owner resets/disables it, ownership changes, or the node is unlinked. Up to ten active family members plus the owner are supported. Each account uses one active home at a time; it must leave/unlink before joining another.

The owner can reset/disable new joins, remove an account, or allow a removed account to rejoin. Resetting/disabling the link keeps existing members connected. Removing an account blocks that account from rejoining even if it retains the current link, until the owner permits rejoining. Members can leave themselves; leaving does not unlink the node or remove other members.

The raw link appears only after creation/reset, so the owner must keep a copy to share it again. If the owner loses the copy, resetting produces a replacement. Only a SHA-256 hash is stored in the link table; the raw token is not recoverable from the database. Reset is confirmed explicitly.

## Access and privacy

| Data/action | Owner | Family member |
|---|---|---|
| Current household's sensor readings and history | Yes | Yes |
| Current household's forecasts and stored sensor notices | Yes | Yes |
| Own patient category, diary, correlation, notification preferences | Own account | Own account |
| Another person's diary, email, health profile or clinical correlation | No sharing grant | No sharing grant |
| Node location label | Read/edit | Read |
| Saved node coordinates and coordinate capture | Owner only | Unavailable |
| Create/reset/disable sharing link; view/manage members | Yes | No |
| Unlink/transfer the node; use ownership setup code | Yes | No |
| Leave shared access | Owner uses unlink workflow | Yes, without affecting owner |
| Administrator monitoring | Separate trusted admin grant | Separate trusted admin grant |

Environmental history belongs to the current household ownership period. A new owner cannot see the previous household's data. Joining a family grants the current home's environmental history, not another person's medical records. Correlation keeps a separate evidence archive and diary for each account; member correlation starts with evidence captured during the current membership.

The owner sees the member's display name saved at joining and an account identifier suffix for removal. The join screen explains this before confirmation. No family list or owner coordinates are returned to member accounts.

Access is verified on each server request and rechecked after asynchronous reads. Leaving/rejoining creates a new membership period so an older pending request cannot become valid again. Ownership/epoch changes invalidate family membership and the old link. One account cannot use membership to gain ownership or administrator privileges.

## Link handling

Links use a cryptographically random 256-bit token in `/join-node#TOKEN`. The URL fragment is removed from the address when the page loads. Tokens are sent only in authenticated POST bodies, not request URLs. The pending token is held in memory across in-app login/onboarding, never in localStorage/sessionStorage. Refreshing before joining may require reopening the original link.

Possession of a valid link allows a signed-in account to request membership, so the owner should share it with the intended household. If it is forwarded unexpectedly, reset or disable it. Do not paste a live private link into chat or commit it. Invalid-link attempts are limited per account. Ordinary database roles cannot read sharing tables or execute privileged sharing functions.

## Individual notifications

Anomaly detection still runs once per node/ownership period. New events produce separate delivery-recipient records for the owner and members who had already joined by the observation time. The worker reserves supported browser bindings separately for each account, checking that account's notification preference, quiet hours, severity throttle, active membership and current node ownership.

One person's quiet hours or disabled preference does not suppress another person's alert. The same event/browser binding is not blindly retried after an uncertain send. Members joining after an event do not receive an old push for it. Stored current-household notices may still be viewed in the app.

Removing access prevents future reads and push reservations. A notification already accepted by the external push service cannot be recalled. Browser binding cleanup on sign-out remains unchanged. iPhone push support is still deferred; sharing readings through the mobile website does not depend on push support.

## Supabase website deployment

1. In SQL Editor, run **only** `supabase/migrations/20261016090000_household_sharing.sql` once. It depends on the already-installed migrations, including `20261016070000_forecast_evidence.sql`.
2. Open Edge Functions → `make-server-a473accf` → Code. Use local files from `supabase/functions/server/`:

| File beside active index.tsx | Action |
|---|---|
| index.tsx | Replace active entrypoint contents |
| node-ownership.mjs | Replace |
| app-feature-routes.mjs | Replace |
| clinical-routes.mjs | Replace |
| clinical-correlation.mjs | Replace |
| anomaly-worker.mjs | Replace |
| household-routes.mjs | Add |

3. Keep all other modules and the existing handler authentication configuration. Deploy after all seven files are updated.
4. No `sensor-ingest`, firmware, model configuration, VAPID keys, private worker token, or Cron changes are required. The existing anomaly processor may remain enabled; the migration preserves existing owner deliveries and uniqueness prevents replay.
5. The existing worker check SQL now also reports aggregate per-recipient delivery states. Check its heartbeat after deployment.
6. Publish the frontend through your branch/PR/Vercel process. Create real share links on the production HTTPS app; a localhost link works only where that local development server is reachable.

## Manual acceptance

Use your owner account A and two separate test accounts B/C. Separate normal Chrome profiles are useful for simultaneous account/push checks. Do not send their passwords, codes, private link or private keys in chat.

1. A opens Node Setup and creates one private link. Copy it. B opens that link, signs into their own account, reviews the node and confirms joining. Verify B sees the same node and current readings/forecasts. A remains the owner.
2. C joins using the **same copied link**. Confirm both members appear for A. No separate link needs generating for C.
3. B's diary/profile/category and notification preferences remain B's. Confirm B cannot see A's diary and cannot unlink the node, generate links, access saved coordinates, or become an administrator merely by joining.
4. B can see the node location label but cannot capture or edit coordinates. The owner can still manage their saved location.
5. A resets the link after confirmation. Test the original copied link with a fresh unjoined account; it should be rejected. B/C remain connected. Keep the new link privately.
6. A removes B after confirmation. B refreshes; node data must disappear. B cannot rejoin with the current link until A chooses Allow to rejoin. Removal is account-specific.
7. C chooses Leave shared node and confirms. A's node remains linked; C loses access. C may voluntarily rejoin with a still-valid link unless the owner has blocked that account.
8. Check sign-in/onboarding from a link when signed out. Joining requires an explicit button after authentication. Cancel must not join. Reload before joining may require reopening the link because the token is memory-only.
9. Use existing Chrome test push separately for the owner and member accounts with their own preferences/permissions/bindings. Genuine automatic anomaly notification still requires fresh qualifying sensor data. Quiet/off preferences must apply independently. Do not manufacture production anomalies.
10. Test planned unlink/transfer separately: old memberships and old link must stop working. Existing queued device uploads are not transferred to a different household's read access.

## Verification boundaries

The automated suite exercises real PostgreSQL functions using PGlite, actual backend routes with controlled Auth/storage fixtures, actual shared telemetry/forecast routing, account-private diary routing, real worker delivery fanout with a fake transport, and React component interactions. It does not perform a real household transfer, production family join, live-model request, or live push delivery on behalf of the user. Those remain manual acceptance steps.

This patch adds family sharing to the existing app. It does not host FastAPI, change the trained model, change sampling intervals, finish physical power-loss testing, or enable iPhone push transport.
