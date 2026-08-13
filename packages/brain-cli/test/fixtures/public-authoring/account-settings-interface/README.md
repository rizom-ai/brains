# Mailbox connection — Phase 1 contract

This checked generic-interface package exists because the operator service
fixture cannot honestly prove the plan's IMAP settings case. Inbound mailbox
ownership belongs to an interface, not a service.

The target demonstrates:

- the same `defineAccountSettings()` contract exported from the interface
  family entry;
- an Account-hosted schema-derived form with a write-only password;
- typed account settings in a supervised daemon;
- runtime-supervised one-task-per-configured-account execution;
- automatic task replacement when settings rotate and cancellation when
  settings are removed; and
- no registry, identity-store, process-role, or private runtime access.

It proves connection lifecycle only. The built-in Email message interface keeps
ownership of inbound event publication and acknowledgement; this fixture does
not route raw mailbox content into agent chat.

Like the operator fixture, this package compiles against the local public entry
and its helpers are classified in the stable ledger. It is not packed or run yet:
Phase 2 must implement encrypted storage and account-task reconciliation. Its
provisional `>=0.2.1` lower bound must be replaced by the first release that
ships the complete contract.
