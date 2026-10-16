---
"@rizom/brain": patch
---

Closing the keyboard in the phone Ask sheet fills the screen again, with the composer at the bottom where a tap brings the keyboard back. The sheet follows the visible area only while its composer has focus: Safari blurs the field while it still reports the keyboard's height, and may report nothing once the keyboard has gone, which left the sheet at half height.
