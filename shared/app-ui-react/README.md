# `@brains/app-ui-react`

Shared controls for authenticated Brain applications. Studio and Web Chat consume this package; public sites and Dashboard continue to use their site-facing component and Tailwind contracts.

Controls read only the semantic `--console-*` token vocabulary. StyleX is compiled by each app's Bun build into static CSS, while Radix supplies dialog, menu, select, switch, and tab behavior. No theme values, style injection, or application state live here.
