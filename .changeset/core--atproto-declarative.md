---
"@brains/atproto": minor
"@brains/atproto-contracts": patch
"@brains/plugins": minor
"@brains/sdk": minor
"@brains/core": patch
---

Migrate `@brains/atproto` to the declarative surface. The package is one `defineServicePlugin` (`atproto`) importing `@brains/sdk`, `@brains/contracts`, `@brains/atproto-contracts` and `@brains/utils`; `AtprotoPlugin` and `atprotoPlugin` are deleted. The four bus subscriptions, the `did:web` and handle-verification routes, and the ready-time card, lexicon-schema and Jetstream work are declared. Everything the service does against a PDS lives on one publisher object, `createAtprotoPublisher`, built at setup from the runtime's reads and exported for the compositions and tests that drive publishing directly. The runtime plugin id is `@brains/atproto:atproto`; the default export is the service with its production collaborators, and `atprotoService(deps)` builds one over a fake PDS client, fetch or socket.

The service owns no entity types and writes none. An entity's AT Protocol projection is that entity's package's code: when a record lands it writes the record's address back onto its own entity. The runtime now binds a declared projection's `buildRecord` and `onPublished` to the declaring package's entity access when it registers the projection, and ignores whatever context the caller hands over; the atproto service passes reads and a refusal to write. The projection contract's `getEntity` is the honest widened form.

The service contract grows what atproto needed, with `@brains/atproto` as the named consumer: `identity`, `profileKinds`, `publicSkills`, `plugins` and `siteUrl` on the setup context, the reads a brain card is built from; and `publish` on the service publisher and on subscription handler messaging. `publish` broadcasts everywhere it is offered — job, reaction, ready, tool and subscription contexts — because an announcement is for everyone listening, not the first subscriber that answers. `@brains/sdk/services` exports `IRuntimeStateStore`, `RuntimeStateScopeOptions`, `PublicSkill`, `AnyInterfaceRouteDefinition` and `AnySubscriptionDefinition`.

The real-bootloader publishing test moves from `@brains/core` to `@rizom/brain`, which already composes both; `@brains/core` no longer dev-depends on `@brains/atproto`.
