# Security Policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in `brains`, report it privately.

**Do not open a public GitHub issue.**

Email: **security@rizom.ai**

Include:

- a description of the issue and likely impact
- reproduction steps or a minimal example
- the affected version, tag, or commit
- any mitigation ideas you already have

If you do not receive an acknowledgement within 7 days, follow up on the same thread.

## Scope

### In scope

- code in this repository
- shipped CLI and runtime behavior
- built-in plugins, interfaces, entities, sites, layouts, and brain models
- insecure defaults or insecure documented workflows

### Out of scope

- brains deployed by users on their own infrastructure
- third-party plugins outside this repository
- vulnerabilities that exist only in upstream dependencies without a `brains`-specific exploit path
- self-DoS via intentional misconfiguration
- issues requiring host-level or physical access

## Response expectations

This is a solo-maintained project.

Best-effort targets:

- acknowledgement within 7 days
- initial triage within 14 days
- fix or mitigation timing based on severity

Critical issues with active exploitation will be prioritized.

## Disclosure policy

We use coordinated disclosure:

1. report privately
2. confirm and triage
3. develop a fix or mitigation
4. coordinate release timing when possible
5. publish the fix and credit the reporter unless they prefer anonymity

## What counts as a vulnerability

Examples:

- authentication or authorization bypass
- token leakage in logs, output, or tracked files
- path traversal outside the intended data directory
- command, SQL, or similar injection vulnerabilities
- insecure defaults that expose data unexpectedly
- built-in behavior that defeats operator-configured access controls

Non-examples:

- expected capabilities available to an authenticated operator
- unsafe deployment choices made by an instance owner
- behavior in third-party integrations the project does not control

## Security updates

Security fixes ship through normal releases. Watch the repository releases and advisories for updates.
