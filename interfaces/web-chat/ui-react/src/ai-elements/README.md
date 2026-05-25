# AI Elements components

This directory contains components derived from the official Vercel AI Elements registry.

AI Elements is canonical for chat UI primitives. The registry is shadcn-style, so components are installed into the source tree instead of imported from a runtime component package.

## Workflow

Before changing component behavior, inspect or install the upstream registry component:

```sh
cd interfaces/web-chat/ui-react
npx ai-elements@latest add <component>
```

Then adapt only what this package needs:

1. Keep the upstream component shape and behavior as close as possible.
2. Replace app-specific import aliases with local imports.
3. Add stable `web-chat-*` classes for Rizom styling hooks.
4. Prefer CSS/token styling over behavioral rewrites.
5. Document any deliberate divergence from upstream.

Do not add unrelated homegrown components here under AI Elements names.
