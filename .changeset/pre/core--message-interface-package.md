---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

`@rizom/brain/interfaces` exports `defineMessageInterfacePackage({ id, config, interfaces })`: one package that runs several message interfaces chosen from one config. `interfaces({ config })` returns the `defineMessageInterface` definitions the parsed config enables, each its own plugin with its own channel under the package, which owns their runtime state. Every interface is declared over the package's config schema; one declared over another schema, one that is not a message interface, an id declared twice and a package nested in another are refused.
