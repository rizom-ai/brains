# Plan: Chat interface structured forms and modals

## Status

Parked future plan. Do not implement until there is a concrete form UX and adapter support path.

## Goal

Add transport-neutral structured forms that can render as platform-native UI where supported, such as Discord modals, Slack/Teams forms, or browser-native web-chat dialogs.

## Current adapter constraint

Discord itself supports modals, and Chat SDK core has modal abstractions. However, the current `@chat-adapter/discord` package does not implement `openModal`.

Therefore Discord modals require either:

1. adding modal support to `@chat-adapter/discord`; or
2. an explicit decision to bypass/extend the adapter for raw Discord modal payloads.

The preferred path is adapter support, not hand-rolled Discord modal payloads in `interfaces/chat`.

## Candidate form use cases

- Save uploaded file with title/entity type/visibility/tags.
- Create note/document with structured fields.
- Edit tool arguments before approval.
- Publish/share artifact metadata.
- Collect feedback reason after negative feedback.
- Disambiguate between multiple upload/entity matches.

## Shared/base escalation

If forms are introduced:

- define transport-neutral form schemas in shared message-interface code;
- normalize form submissions into shared metadata/events;
- validate submissions with shared helpers;
- render forms per interface/platform.

## Interface mapping

- Discord: modal support requires adapter work first.
- Slack/Teams: use platform-native form/dialog primitives when available.
- Web chat: render browser-native dialogs/forms from the same shared schemas.

## Non-goals

- Implementing Discord modal support in this plan.
- Hand-rolling raw Discord modal payloads inside `interfaces/chat` without a concrete UX.
- Replacing simple buttons or yes/no approvals with forms.
