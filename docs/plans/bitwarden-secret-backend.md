# Decision: Reject Bitwarden as the Default Secret Backend

## Status

Rejected.

## Decision

Do not switch the default secret backend from 1Password to Bitwarden.

`brain init` should not switch its default path to Bitwarden. The current default can stay non-Bitwarden, and 1Password remains the supported bulk-load backend for operators who want a real secret manager path.

## Why

The documented varlock Bitwarden plugin shape does not match the operator flow this repo is built around.

### What our flow needs

The current deploy story is:

1. scaffold `.env.schema`
2. operator runs `brain secrets:push`
3. deploy workflow bulk-loads secrets through varlock

This works because the 1Password plugin has a bulk-load path:

- `# @initOp(token=$OP_TOKEN)`
- `# @setValuesBulk(opLoadVault(...))`

### What Bitwarden provides instead

The documented Bitwarden plugin shape is per-secret and UUID-based:

- `# @initBitwarden(accessToken=$BITWARDEN_ACCESS_TOKEN)`
- `KEY=bitwarden("12345678-1234-1234-1234-123456789abc")`

There is no documented bulk loader analogous to `opLoadVault(...)` / `opLoadEnvironment(...)`.

That inverts the workflow:

1. operator must first create each secret in Bitwarden
2. operator must capture each UUID
3. operator must embed those UUIDs into `.env.schema`
4. only then can varlock resolve the values

That makes the operator the UUID custodian and breaks the intended `brain secrets:push` → deploy flow.

## Additional red flag

The published `@varlock/bitwarden-plugin` npm artifact also looked suspicious during verification, but that is not the decisive reason for rejection.

Even if the package were published perfectly, the documented UUID-only API is still the wrong architecture for this repo.

## When to reconsider

Reconsider Bitwarden only if varlock ships a real bulk-load helper for Bitwarden, equivalent in practice to the 1Password flow.

Examples of what would unblock reconsideration:

- `bitwardenLoadProject(...)`
- `bitwardenLoadEnvironment(...)`
- any other documented bulk-load function that lets the workflow resolve a whole instance secret set without embedding per-secret UUIDs in `.env.schema`

## Resulting cleanup

- `packages/brain-cli/src/lib/env-schema.ts` does not switch the default path to Bitwarden.
- 1Password-backed workflows keep using `OP_TOKEN` when that backend is selected.
- The repo does not advertise Bitwarden as a supported default path.
