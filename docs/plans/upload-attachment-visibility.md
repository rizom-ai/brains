# Upload/attachment visibility — no NL selection

## The rule

**What attachments the model sees is data and cost policy — never message
wording.** This is the same rule as the
[agent interpretation boundary](./system-create-source-architecture.md) (language
is data, not control flow), applied to context assembly: code decides _what to
show the model_, the model decides _what the user meant_.

## Why this one is worse than the create-source guards

The create-source guards branch _after_ the model is given the context. These
guards run _before_ — they decide which uploads even reach the model by
regex-matching the message ("it", "this", "latest", "first", "save"). That
**starves the interpreter**: the model cannot resolve a reference it was never
shown. A wrong guess here is invisible — the model just silently never sees the
attachment the user meant.

## The shape it should be

1. Assemble candidate upload refs by **structure and cost**, not wording: all
   current-turn refs + a bounded window of recent history. The cap is a number,
   not a keyword.
2. Pass those candidates to the model as structured data (id, filename, type).
3. The model resolves "it" / "the first one" / "the PDF" against that list inside
   its tool args. That is the one interpretation step.

## Delete these (concrete)

| File                                                      | Symbol / thing                                                                                                                                                                           | Action                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `shell/plugins/src/message-interface/upload-selection.ts` | `selectReferencedAttachments` — `/\b(first\|oldest\|earliest)\b/`, `/\b(latest\|newest\|most recent\|last)\b/`, and filename `.includes()` matching                                      | delete the wording branches; return the candidate set, let the model pick    |
| `shell/ai-service/src/conversation-messages.ts`           | `shouldNarrowToLatestUploadRef`, the wording branches in `selectConversationUploadRefs`, and helpers `hasSingularUploadReference`, `asksToPersistUpload`, `normalizeUploadReferenceText` | delete wording-based narrowing; select candidates by turn/recency + cost cap |
| `shell/ai-service/src/conversation-messages.ts`           | `shouldHydrateUploadAttachmentsForMessage` (gates hydration on save-keyword regex)                                                                                                       | hydrate by structure/cost policy, not by message keywords                    |
| `shell/ai-service/src/conversation-messages.ts`           | `namesKnownFile` (filename-in-message matching used to drive selection)                                                                                                                  | delete as a _selection_ driver; filenames go to the model as data            |

Do **not** replace any of these with a new keyword matcher or a "router".

## Allowed (not a violation)

- A **wording-independent cost cap** on how many refs are passed (e.g. all
  current-turn refs + last N historical). It bounds context size; it does not
  read intent.
- MIME-type checks (`startsWith("image/")`, extractable-type lists). Those read
  the file's type, not the user's sentence.

## Out of scope — confirmation parsing (explicit exception)

`confirmation-handler.ts` / `confirmation-routing.ts`
(`parseConfirmationResponse`, `parseConfirmationIntent`, `extractApprovalId`) are
**not** part of this cleanup. Confirmation is a closed yes/no protocol asked at a
known point, with structured approval cards as the primary affordance and
keyword/ID parsing as the fallback. Keep it as a fallback, do **not** expand it,
and do **not** cite it as precedent for wording-based selection elsewhere.

## Related — call-options gates (owned by the sibling doc)

The wording gates in `shell/ai-service/src/call-options.ts` are **not** in this
doc's scope but are not orphaned: they are deleted by the
[interpretation-boundary doc](./system-create-source-architecture.md) and caught
by its grep-test. This includes the **non-upload** ones — notably
`shouldDisableSystemCreateForSavedAgentContact`, which gates `system_create` on
email/contact wording. Don't assume "not about attachments" means "out of scope";
it belongs to the sibling doc, not to nothing.

## Enforcement

Extend the interpretation-boundary grep-test (see the sibling doc) to cover:

- `shell/ai-service/src/conversation-messages.ts`
- `shell/plugins/src/message-interface/upload-selection.ts`

Fail the build on `RegExp` / `.test(` / `.match(` / `.includes(` applied to a
message/user-text variable to drive attachment selection. Confirmation files are
the annotated, reviewed exception.

## Done when

- [ ] No function selects which upload/attachment to attach based on message wording.
- [ ] `selectReferencedAttachments` no longer branches on "first/latest/oldest".
- [ ] `conversation-messages.ts` selects candidate refs by turn/recency + cost cap only.
- [ ] The model receives candidate refs as structured data and resolves references in its tool args.
- [ ] Any ref-count cap is wording-independent.
- [ ] The grep-test covers both files above and is green.
