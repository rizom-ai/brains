---
"@brains/chat": patch
"@brains/plugins": patch
"@rizom/brain": patch
---

The chat interface talks on WhatsApp. Set `WHATSAPP_PHONE_NUMBER` (or `plugins.chat.adapters.whatsapp.phoneNumber`) to a number with WhatsApp on its own phone, and the brain links to it as a device through Baileys: it logs a pairing code on first start, keeps the session in runtime state, and reconnects on its own. It answers direct messages and @-mentions in groups, names senders by phone number for `whatsapp:<number>` permission rules, takes images, video, audio and documents from trusted senders, and sends files as images or documents. The route is unofficial, and WhatsApp can ban a number that uses it; `docs/interface-setup.md` covers the setup. A job's completion now also reaches the chat when the message that stood for it cannot be edited, on every platform.
