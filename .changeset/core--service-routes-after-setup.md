---
"@brains/plugins": minor
"@brains/newsletter": patch
"@brains/dashboard": patch
"@brains/studio": patch
---

A service route answers with its own instance's state

Service routes were read from config alone, so that composition tooling could
enumerate them without registering anything. No such tooling exists: production
collects routes from registered plugins, and every other caller was a test. What
the rule did produce was packages holding their client in a variable outside the
plugin, which the next instance overwrote.

Two instances of one exported definition, configured with different keys, both
answered with the second one's key. That is now a regression test, and it fails
against the old behaviour.

The `routes` slot receives `state` and `jobs` alongside `config`, and routes are
built per instance after setup. Newsletter, Dashboard and Studio drop their outer
holders. A route read from a plugin that has not registered now fails with the
same message any other pre-setup read gives, rather than returning routes that
would fail at the first request.
