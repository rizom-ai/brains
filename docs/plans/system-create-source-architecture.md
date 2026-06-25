# Agent interpretation boundary — target architecture

## The rule

**Language is data, not control flow.** The model is the only thing that reads
natural language. It happens once, at the model call, producing typed tool args.
Everything else branches on types and policy.

Replaces `save-note-source-resolution.md` and `agent-instruction-surface.md`
(deleted). Source routing is one instance of the rule.

## What counts as an NL guard (so it can't be argued around)

> Any code that reads user/message **text** and returns a value used for a
> control-flow or capability decision.

This is banned **regardless of where it lives** — including inside a file named
`*-router.ts`, inside `getInstructions()`, or behind a "deterministic" comment.
Centralizing regexes into one tested router does **not** make them allowed. A
keyword table that picks a `source.kind` is an NL guard. The test is the input
(text) and the use (a branch), not the tidiness.

The only allowed text→decision step is the model emitting a typed tool call.

## Delete these (concrete)

| File                                               | Symbol / thing                                                                                                                                                                                                                                                                                  | Action                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `shell/ai-service/src/call-options.ts`             | **all** message-text gating: `getSourceArtifactRequestInfo`, `shouldEnableCreateSourceAttachment`, `shouldDisableDocumentGenerate`, `shouldDisableSystemCreateForUploadRead`, and `shouldDisableSystemCreateForSavedAgentContact` (non-upload — gates `system_create` on email/contact wording) | delete the functions and their callers; tools are never hidden by wording |
| `shell/core/src/system/entity-create-tool.ts`      | `normalizeCreateSource` source-precedence logic (drops `content` when `from` present)                                                                                                                                                                                                           | delete; mixed sources are rejected by schema, not silently resolved       |
| `shell/ai-service/src/brain-instructions.ts`       | routing prose: `### Core Tools`, `### Image, OG & Cover Operations`, `### Multi-Turn Context`, `### Entity-Specific Update Rules`, `### CRITICAL: Always Invoke Tools for Actions`                                                                                                              | delete the routing content; keep only identity + permission summary       |
| entity `getInstructions()` (`entities/*/src/**`)   | any "use `system_create` with X when the user says Y" prose                                                                                                                                                                                                                                     | delete; the schema carries the choice                                     |
| `shell/ai-service/test/build-instructions.test.ts` | `toContain` substring assertions on routing prose                                                                                                                                                                                                                                               | delete; replace with the contract tests below                             |

Do **not** replace any of these with a new keyword matcher, router, or shortcut.

## Keep / build (concrete)

- `shell/core/src/system/schemas.ts`: `system_create` input is the `source`
  discriminated union below. `toModelVisibleInputSchema` exposes `source` **only**
  — no flat source fields reach the model.

  ```ts
  source:
    | { kind: "text"; content: string }
    | { kind: "generate"; prompt: string }
    | { kind: "url"; url: string }
    | { kind: "upload"; upload: { kind: "upload"; id: string }; transform: "extract-markdown" }
    | { kind: "attachment"; sourceEntityType: string; sourceEntityId: string; attachmentType: string }
    | { kind: "prior-response"; messageId?: string }
  ```

- Resolution stays server-side and fails closed: unknown `messageId` errors;
  nothing is silently substituted; confirmation freezes resolved bytes.
- Schema **rejects** `source` combined with any flat source field, before side
  effects. No precedence, no silent drop.
- Tool availability is decided by typed policy (identity, entity, permission) in
  the policy layer — never by message text.

## Enforcement (so the next person can't reintroduce it)

Add a unit test that greps these files and **fails** on a message-text regex:

- Scan `call-options.ts`, `entity-create-tool.ts`, and any `*-router.ts` for
  `RegExp` / `.test(` / `.match(` applied to message or user-text variables.
- Allowed exceptions must be annotated `// not-an-nl-guard: <reason>` and reviewed.

If that test is hard to write, that itself means text is still driving control
flow — which is the thing being removed.

## Done when

- [ ] `shouldDisableSystemCreateForUploadRead` and the call-options regexes are gone.
- [ ] `normalizeCreateSource` no longer branches on which source fields are present.
- [ ] Model-visible `system_create` is `source`-only; flat fields rejected when mixed.
- [ ] `brain-instructions.ts` carries no routing rules.
- [ ] No `*-router.ts` exists, or if it does, it contains zero message-text regexes.
- [ ] The enforcement grep-test is green.
- [ ] Routing tests assert typed contracts, not prompt substrings.

If a case still misroutes after all this: the fix is a **structured signal** (a
clicked card, an action, a command) or **model fallback**. Never a regex.
