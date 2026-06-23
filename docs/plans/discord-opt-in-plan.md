# Discord opt-in plan for rover-pilot ops

## Goal

Make Discord opt-in for `@rizom/ops` rover-pilot scaffolding. New pilot users should be created with Discord disabled unless the operator explicitly requests Discord during onboarding.

## Desired behavior

Default user add:

```bash
bunx brains-ops user:add . alice --cohort cohort-1
```

Expected output:

```yaml
handle: alice
anchorProfile:
  name: Alice
discord:
  enabled: false
```

Discord-enabled user add:

```bash
bunx brains-ops user:add . alice --cohort cohort-1 --discord --anchor-id 123
```

Expected output:

```yaml
handle: alice
anchorProfile:
  name: Alice
discord:
  enabled: true
  anchorUserId: "123"
```

For backward compatibility, `--anchor-id <id>` may imply Discord enabled even if `--discord` is omitted.

## Implementation steps

1. Update `brains-ops user:add` scaffold defaults.
   - Change generated `discord.enabled` from `true` to `false`.
   - Do not generate `anchorUserId` unless Discord is enabled.

2. Add explicit Discord CLI support.
   - Add a `--discord` boolean flag.
   - Keep `--anchor-id` supported.
   - Treat `--anchor-id` as implying `--discord` for compatibility.

3. Update per-user secrets template generation.
   - Do not include `discordBotToken:` for default Discord-disabled users.
   - Include `discordBotToken:` only when Discord is enabled.

4. Preserve reconcile behavior.
   - When `discord.enabled: false`, generated `brain.yaml` should have `anchors: []` and no `plugins.discord` block.
   - When `discord.enabled: true`, generated `brain.yaml` should include the Discord plugin and require a per-user Discord token during `secrets:encrypt`.

5. Update docs and templates.
   - Remove “Discord is enabled by default” wording.
   - Describe browser chat/passkey setup as the default pilot interface.
   - Describe Discord as optional and explicitly enabled.
   - Add examples for default onboarding and Discord-enabled onboarding.

6. Add tests.
   - `user:add` default creates `discord.enabled: false` and no `anchorUserId`.
   - default secrets template does not include `discordBotToken`.
   - `user:add --discord` creates `discord.enabled: true` and includes `discordBotToken` in the secrets template.
   - `user:add --anchor-id 123` remains backward compatible and enables Discord with that anchor.
   - reconcile for Discord-disabled users omits `plugins.discord` and uses `anchors: []`.
   - `secrets:encrypt` for Discord-disabled users succeeds with zero Discord secrets.

## Release and downstream adoption

1. Publish a new `@rizom/ops` release.
2. In `rover-pilot`, bump `package.json -> @rizom/ops`.
3. Run `bun install`.
4. Run the relevant scaffold/reconcile flow.
5. Verify generated outputs have no drift except expected scaffold/template changes.
6. Commit the updated lockfile and any scaffolded deploy/doc artifacts.
