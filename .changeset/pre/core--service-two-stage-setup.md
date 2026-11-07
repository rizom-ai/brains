---
"@brains/contracts": patch
"@brains/runtime-state": patch
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

`defineServicePlugin` now takes two arguments: a header with the package's `id`, `config`, `accountSettings` and `setup`, and the behavior that reads the state `setup` returns, whose slots may be written in any order; a behavior slot written into the header is refused. `setup` is given `runtimeState({ namespace, schema })`, a store qualified by the owning package so two packages naming the same namespace never share a record. `@rizom/brain/services` exports `SdkError`, `SdkErrorCode`, `SdkErrorData`, `sdkErrorCodeSchema` and `sdkErrorSchema`: a coded failure whose code survives every boundary and whose diagnostic message stays local. Runtime state now stores the schema's input and parses it at every read, so a transforming schema no longer fails on a stored value; a value that does not survive a JSON round trip is refused before it is written, and `compareAndSet` compares the expected value with the stored value as read, answering `false` rather than throwing for one the schema would refuse. Namespaces may be up to 512 characters, and a scoped store is a frozen handle that exposes no storage internals.
