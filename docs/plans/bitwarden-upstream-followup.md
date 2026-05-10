# Plan: upstream Bitwarden deploy workflow follow-up

## Goal

Ship the deploy workflow improvements learned during the Bitwarden migration so newly scaffolded or regenerated brain instances are safe by default and do not need per-repo hand patches.

## Current state

- `brain secrets:push --push-to bitwarden` exists and rewrites `.env.schema` with Bitwarden UUID refs.
- `brain init --deploy --regen` already detects Bitwarden-backed schemas and maps only bootstrap secrets such as `BWS_ACCESS_TOKEN` from GitHub Actions secrets.
- Generated deploy workflows already use `bunx varlock@1.1.0` instead of obsolete `npx -y varlock`.
- A changeset already exists for the deploy workflow template update.
- 2026-05-09 doc-brain deploy smoke exposed two operational issues:
  - Varlock-loaded secrets were echoed in the GitHub Actions environment block because values were appended to `$GITHUB_ENV` without first adding GitHub masks.
  - A stale Kamal deploy lock from a failed/cancelled deploy blocked the next deploy until manually released.

## Fixes still needed upstream

### 1. Mask Varlock-loaded values before exporting them

File: `shared/deploy-templates/src/scaffold.ts`

Update the generated `Load env via varlock` step so every non-empty resolved value is masked with GitHub Actions `::add-mask::` before anything is appended to `$GITHUB_ENV`.

Requirements:

- Mask all non-bootstrap resolved values.
- Escape mask payloads per GitHub Actions rules: `%`, `\r`, `\n`.
- Do not mask or export bootstrap-only keys such as `BWS_ACCESS_TOKEN`.
- Keep writing multiline deploy material from `/tmp/varlock-env.json` for SSH/PEM handling.

### 2. Make `$GITHUB_ENV` export multiline-safe

File: `shared/deploy-templates/src/scaffold.ts`

Current generated workflow skips multiline values when appending to `$GITHUB_ENV`. Replace that with GitHub's heredoc form:

```text
KEY<<DELIMITER
value
DELIMITER
```

Requirements:

- Generate a delimiter that cannot collide with the value.
- Continue excluding bootstrap secrets.
- Preserve normalized newlines.

### 3. Add retry around Varlock resolution

File: `shared/deploy-templates/src/scaffold.ts`

Wrap the compact Varlock load in a small retry loop, matching the rover-pilot patch:

- 3 attempts
- 5 second sleep between attempts
- no secret output

Consider applying the same retry behavior to the validation step or replacing the separate validation step with the compact load step so CI performs one resilient resolution path.

### 4. Keep GitHub Secrets mode working

Files:

- `packages/brain-cli/src/commands/init.ts`
- `shared/deploy-templates/src/scaffold.ts`
- `packages/brain-cli/test/init.test.ts`

Preserve the existing behavior for plain `.env.schema` files:

- generated workflow maps each schema key from `${{ secrets.NAME }}`
- Varlock resolves from process env
- no Bitwarden plugin or bootstrap token is required

Bitwarden mode should continue to map only bootstrap tokens.

### 5. Update tests

File: `packages/brain-cli/test/init.test.ts`

Add or tighten assertions that generated deploy workflows:

- contain `::add-mask::`
- do not export `BWS_ACCESS_TOKEN` to `$GITHUB_ENV`
- use retry logic for `bunx varlock@1.1.0 load --format json --compact`
- support multiline `$GITHUB_ENV` entries
- still map all schema keys in GitHub Secrets mode
- still map only `BWS_ACCESS_TOKEN` in Bitwarden mode

### 6. Decide deploy-lock policy

File: `shared/deploy-templates/src/scaffold.ts`

Doc-brain needed a one-off stale lock release after a failed deploy left the lock at an old commit. Upstream should decide whether generated workflows should handle this automatically.

Options:

- Add a pre-deploy step: `kamal lock release || true` before `kamal setup --skip-push`.
- Prefer manual recovery and document `kamal lock release` as the runbook for failed/cancelled deploys.

If automated, keep it immediately before the deploy step and do not run it before provisioning/DNS/TLS prep. The intent is only to clear stale locks from prior failed deploys, not to bypass active concurrent deploys.

### 7. Update docs

Files:

- `packages/brain-cli/docs/deployment-guide.md`
- `packages/brain-cli/docs/cli-reference.md`
- optionally `docs/secrets-bitwarden-plan.md`

Document the final generated workflow behavior:

- GitHub Secrets mode: schema keys come from GitHub Actions secrets.
- Bitwarden mode: GitHub keeps only `BWS_ACCESS_TOKEN`.
- Varlock values are masked before being exported to job env.
- CI should use a read-only Bitwarden machine account token.

### 8. Release `@rizom/brain`

After implementation and tests:

1. Run targeted checks:
   - `bun test packages/brain-cli/test/init.test.ts`
   - `bun run typecheck`
2. Ensure the existing changeset covers the template update, or amend it if the scope changes.
3. Let the release workflow publish a new alpha/patch containing the deploy template fixes.
4. Verify the published CLI can regenerate a Bitwarden-backed deploy workflow with masking and retry.

## Suggested implementation order

1. Patch `renderDeployWorkflow()` in `shared/deploy-templates/src/scaffold.ts`.
2. Update `packages/brain-cli/test/init.test.ts` expectations.
3. Run targeted tests and typecheck.
4. Update docs.
5. Publish release.
6. Smoke-test `brain init --deploy --regen` on a throwaway Bitwarden-backed instance.

## Acceptance criteria

- Newly generated Bitwarden-backed deploy workflows require only `BWS_ACCESS_TOKEN` in GitHub Secrets.
- No Varlock-loaded secret is written to `$GITHUB_ENV` before being masked.
- Multiline secrets are handled safely.
- Transient Varlock/Bitwarden failures are retried.
- Existing GitHub Secrets-backed deployments remain compatible.
- Stale Kamal deploy-lock recovery is either automated in the generated workflow or documented as an explicit operator runbook.
- A released `@rizom/brain` version includes the updated template.
