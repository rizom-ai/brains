---
"@rizom/brain": patch
---

On a phone, the Ask box opens full screen once the visitor engages, instead of staying half-way down the page under the keyboard.

- **Keyboard:** the sheet fits the visual viewport, so the composer sits on the keyboard.
- **Page:** the page behind the sheet is locked.
- **Closing:** the close button, Back and Escape all close it, and sending closes the keyboard so the answer gets the screen.
- **Map:** the homepage atlas docks its map as a strip under the sheet header, where the answer's sources light up, and folds the strip away while typing.
- **After closing:** the box offers "Continue conversation" above its composer.
- **Contract:** `@brains/contracts` adds `ASK_SHEET_MEDIA`, `ASK_SHEET_ATTRIBUTE`, `ASK_KEYBOARD_ATTRIBUTE` and `ASK_SHEET_HEADER_HEIGHT` for hosts.
