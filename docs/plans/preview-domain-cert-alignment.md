# Preview domain and origin cert alignment

## Problem

Standalone deploy scaffolding derives preview hosts differently for nested domains:

- `docs.rizom.ai` becomes `docs-preview.rizom.ai`
- origin cert bootstrap commonly covers `docs.rizom.ai` and `*.docs.rizom.ai`

That leaves the generated preview host outside the certificate SAN set and can produce Cloudflare 526 errors after deploy.

## Desired behavior

Default preview hosts should live under the configured brain domain:

```text
preview.<brain-domain>
```

Examples:

- `rizom.ai` -> `preview.rizom.ai`
- `docs.rizom.ai` -> `preview.docs.rizom.ai`

This aligns DNS, Kamal proxy hosts, and origin certificates generated for `<domain>` plus `*.<domain>`.

## Proposed implementation

1. Change the shared standalone deploy scaffold in `shared/deploy-templates/src/scaffold.ts` so `extract-brain-config.rb` always emits:

   ```ruby
   preview_domain = "preview.#{brain_domain}"
   ```

2. Update scaffold tests that assert the old nested-domain branch:
   - `packages/brain-cli/test/init.test.ts`
   - any mirrored `packages/brains-ops/test/init.test.ts` expectations if still applicable

3. Consider adding an explicit config override later, for example:

   ```yaml
   previewDomain: preview.docs.rizom.ai
   ```

   Keep this separate unless a current consumer needs a non-default preview host.

4. Add a changeset for the CLI/deploy-template package that owns the scaffold.

## Validation

- Generate deploy files for a root domain and a nested domain.
- Assert `PREVIEW_DOMAIN=preview.<domain>` in generated `scripts/extract-brain-config.rb` behavior or test fixtures.
- Confirm generated `config/deploy.yml` still references `ENV['PREVIEW_DOMAIN']` unchanged.
- For `docs.rizom.ai`, verify `preview.docs.rizom.ai` is covered by the existing origin certificate pattern.

## Local instance note

`rizom-ai/doc-brain` has been patched locally first by changing its checked-in `scripts/extract-brain-config.rb` to emit `preview.docs.rizom.ai` for `domain: docs.rizom.ai`.
