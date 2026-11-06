---
"@rizom/brain": patch
---

Public declarations no longer name Node's `Buffer`, so a consumer compiling without Node types can read them. Upload contents, publish and attachment media data, and AT Protocol blob uploads are typed `Uint8Array`; an attachment provider may return plain `Uint8Array` data, and the runtime takes a zero-copy Buffer view where a Node API needs one.
