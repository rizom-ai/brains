# Mailbox connection — Phase 0 target

This source-first generic-interface package exists because the operator service
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

Like the operator fixture, this proposal is not compiled, packed, or included
in the stable ledger during Phase 0. Its provisional `>=0.2.1` lower bound must
be replaced by the first release that ships the accepted contract.
