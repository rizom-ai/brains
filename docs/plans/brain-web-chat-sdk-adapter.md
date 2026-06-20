# Plan: Brain web Chat SDK adapter strategy

## Status

Parked strategy plan. This is not part of the immediate Discord enhancement backlog.

## Goal

Determine a path for browser web chat to share Chat SDK semantics with Discord, Slack, WhatsApp, and other chat providers without losing Brain-specific web-chat features.

## Finding

Do not replace `interfaces/web-chat` with the official `@chat-adapter/web` package as-is.

The official adapter is text-first and currently does not handle the Brain web-chat features we rely on:

- upload refs and runtime upload retrieval;
- approval response parts;
- structured Brain cards/data parts;
- generated artifact routes;
- session list/rename/archive/delete;
- Brain conversation-service history;
- active progress streaming;
- operator auth/session behavior.

## Direction

Use `@chat-adapter/web` as a reference for AI SDK `useChat` stream protocol integration, not as a direct replacement.

A future Brain-specific web adapter should preserve existing web-chat behavior while adopting shared Chat SDK/message-interface semantics where useful.

## Requirements for any migration path

A Brain web adapter must preserve:

- operator auth;
- current session management;
- upload route and upload-ref behavior;
- approval/action response handling;
- structured Brain data parts;
- generated image/PDF artifact routes;
- active progress/status streaming;
- Brain conversation-service history as source of truth.

## Shared/base escalation

- Queueing/skipped-input, forms, approval/action semantics, notice visibility, and future feedback events should be modeled in shared message-interface helpers/classes before being rendered in Discord, Slack, WhatsApp, or web-chat.
- Avoid Discord-shaped semantics in shared code.
- Store transport-neutral event/input/output shapes.

## Provider strategy

- Add future Slack/WhatsApp adapters under `interfaces/chat` where practical so they share `MessageInterfacePlugin` semantics and the Chat SDK handler model.
- Keep provider-specific rendering, permission context extraction, native file delivery, webhook/gateway setup, and platform limits in adapter-specific code.

## Non-goals

- Replacing the current web-chat UI with `@chat-adapter/web` as-is.
- Removing web-chat session/history routes in this plan.
- Rewriting all web-chat transport code before a parity path is proven.
