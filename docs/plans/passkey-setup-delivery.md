# Plan: Passkey Setup Delivery

## Status

Superseded by two narrower plans:

- `docs/plans/passkey-setup-bootstrap.md` — OAuth/passkey setup token generation, validation, and internal setup URL exposure.
- `docs/plans/operator-onboarding-notifications.md` — system-initiated operator push notifications, starting with Discord anchor DMs.

## Rationale

First-passkey setup has two separate concerns:

1. **OAuth/passkey bootstrap** — auth-service generates and validates a one-shot setup URL.
2. **Operator onboarding push** — shell/interfaces deliver sensitive onboarding messages to trusted operators.

Keeping them separate prevents auth-service from depending on Discord or any other transport while still giving the notification layer a clear setup URL contract to consume.
