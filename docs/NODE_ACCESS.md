# Persistent Node 1 access

Node authorization now uses a server-owned database record, rather than the `ALLERT_NODE1_USER_IDS` deployment secret. A user's Supabase Auth UUID stays the same across new login sessions, logout/login cycles and token refreshes. The previous approved account was migrated without altering its profile, diary or forecast records.

The record lives in the existing protected `kv_store_a473accf` table:

```text
key: node-assignment:v1:<AUTH_USER_UUID>:node-1
value:
  schema_version: 1
  user_id: <AUTH_USER_UUID>
  node_id: node-1
  active: true
  assigned_at: <UTC timestamp>
```

Only a trusted project administrator or server process using the service-role credential may manage assignments. Anonymous and ordinary authenticated database reads/writes were tested and blocked. The app does not expose an assignment-writing route. Login, signup, profile changes and browser settings do not grant node access.

To assign another approved existing account, a project administrator can use the Supabase SQL editor with this template. Replace the placeholder with that account's actual Auth UUID; do not use an email address, session ID or sensor ID:

```sql
insert into public.kv_store_a473accf (key, value)
values (
  'node-assignment:v1:<AUTH_USER_UUID>:node-1',
  jsonb_build_object(
    'schema_version', 1,
    'user_id', '<AUTH_USER_UUID>',
    'node_id', 'node-1',
    'active', true,
    'assigned_at', now()
  )
)
on conflict (key) do update set value = excluded.value;
```

Set `active` to `false` to revoke access. The read route checks the stored record on every request, so revocation does not require a browser logout or a redeploy. Missing, inactive, mismatched or unknown-version assignments fail closed with HTTP 403. A private database outage must not be interpreted as permission to read a snapshot.

`ALLERT_WORKER_TOKEN` remains the publishing credential. `ALLERT_DISPLAY_REPLAY` still selects historical replay versus live data. Neither grants a user access. `ALLERT_NODE1_USER_IDS` is obsolete and ignored by the updated read route.

## Regression coverage

`integration/test_deployed_node_access.py` checks the deployed revision before exercising assigned/unassigned sessions, four fresh login/logout cycles, four refreshes, distinct session tokens, stable six-output snapshots, 20 concurrent reads, user/profile spoofing, server-only database access, revocation/reinstatement, wrong users/nodes and unknown record versions. Its 59 checks passed. Tests create and remove only their synthetic accounts and assignment rows; they never edit deployment secrets or existing assignments.

The old local secret-mutating bridge test was retired. Re-run this suite with a private credentials file:

```powershell
py -3.13 integration/test_deployed_node_access.py --credentials PRIVATE_CREDENTIALS_FILE --report PRIVATE_REPORT_FILE
```

Keep credentials and actual account UUIDs out of Git commits and browser bundles. See `TEST_REPORT.md` for the separate hardware, live-worker, push, browser and operational acceptance boundaries.

## Shared sensor read access

A sensor retains its original `sensor_devices.user_id`. To authorize an additional account, the server reads a private KV record `sensor-share:v1:<AUTH_UUID>` with `{schema_version:1,user_id:<AUTH_UUID>,device_id:<EXISTING_DEVICE_ID>,active:true}`. Ordinary clients cannot provision this record. The telemetry endpoint merges the account's owned active sensors with the explicitly shared active sensor, deduplicates the same sensor, and refuses ambiguous multiple active devices. Revoking `active` stops shared reads without requiring logout. The assignment does not grant direct database write access or alter model-node permissions. Provision records only after the project owner approves the specific sensor/account relationship.
