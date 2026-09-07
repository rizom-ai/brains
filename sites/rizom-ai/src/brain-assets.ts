// Lossless raster captures in self-contained SVG assets: the site asset contract is text-based.
import chat_desktop_dark from "./assets/brain/chat-desktop-dark.svg" with { type: "text" };
import chat_desktop_light from "./assets/brain/chat-desktop-light.svg" with { type: "text" };
import chat_mobile_dark from "./assets/brain/chat-mobile-dark.svg" with { type: "text" };
import chat_mobile_light from "./assets/brain/chat-mobile-light.svg" with { type: "text" };

export const brainCaptureAssets: Record<string, string> = {
  "/images/brain/chat-desktop-dark.svg": chat_desktop_dark,
  "/images/brain/chat-desktop-light.svg": chat_desktop_light,
  "/images/brain/chat-mobile-dark.svg": chat_mobile_dark,
  "/images/brain/chat-mobile-light.svg": chat_mobile_light,
};
