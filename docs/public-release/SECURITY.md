# Security Policy

## Reporting a Vulnerability

If you believe you've found a security vulnerability in `brains`, please report it privately. **Do not open a public GitHub issue.**

Email: **security@rizom.ai**

Include in your report:

- A description of the vulnerability and its impact
- Steps to reproduce, ideally with a minimal example
- The affected version(s) — commit hash or release tag
- Any suggested mitigation

If you don't get an acknowledgement within 7 days, please ping again on the same thread or escalate via a different channel.

## Scope

**In scope:**

- Code in this repository (`shell/*`, `shared/*`, `plugins/*`, `entities/*`, `interfaces/*`, `packages/*`, `brains/rover`, `sites/{default,personal,professional,rizom}`)
- Default behavior of plugins shipped in this repository
- Documentation that recommends insecure patterns

**Out of scope:**

- Brains deployed by users on their own infrastructure (those are the operator's responsibility)
- Third-party plugins not in this repository
- Vulnerabilities in upstream dependencies (please report those to the upstream maintainer; if exploitation requires a configuration we ship by default, that part is in scope)
- Self-DoS via misconfiguration (e.g., setting an absurdly high embedding batch size)
- Issues that require physical access to the host running the brain

## Response Timeline

This is a small project with limited maintainer bandwidth. Realistic expectations:

- **Acknowledgement**: within 7 days
- **Initial triage**: within 14 days
- **Fix or workaround**: best-effort, prioritized by severity

For critical issues with active exploitation, expect faster turnaround. For low-severity issues, expect slower.

## Disclosure Policy

We follow a coordinated disclosure model:

1. You report privately
2. We confirm and triage
3. We develop a fix
4. We coordinate a release date with you
5. We publish a security advisory and credit you (unless you prefer to remain anonymous)
6. After the advisory, public disclosure is welcome

We aim for a maximum of **90 days** between report and public disclosure, faster if a fix is available sooner.

## What Counts as a Vulnerability

The framework's threat model assumes:

- The brain operator is trusted
- The operator's chosen AI provider is trusted (the brain sends content to it)
- Content stored in the brain is trusted (the operator controls what enters)
- Network access to the brain's interfaces (MCP, A2A, webserver) is controlled by the operator (firewall, auth tokens, anchors)

Things that violate these assumptions are bugs, not vulnerabilities (e.g., "an authenticated MCP client can call tools" is intended).

Things that **are** vulnerabilities:

- Authentication or authorization bypass on any interface
- Token leakage in logs, error messages, or git commits
- Path traversal allowing reads or writes outside the configured data directory
- Injection vulnerabilities (SQL, command, prompt injection that escalates privileges)
- Default configurations that expose data publicly when the operator did not opt in
- Insecure defaults in cryptography, secret handling, or session management
- Vulnerabilities in built-in plugins that an operator cannot mitigate via configuration

## Security Updates

Security fixes ship as patch releases (e.g., `0.1.1` → `0.1.2`). Watch the repository's [Releases](https://github.com/rizom-ai/brains/releases) page or subscribe to the security advisories feed.

## Acknowledgements

Reporters who follow this policy will be credited in the security advisory unless they prefer otherwise.
