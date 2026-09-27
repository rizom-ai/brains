/** @jsxImportSource react */
import { createRoot } from "react-dom/client";
import { GuestApp } from "./GuestApp";

// The public Ask page: the guest conversation alone, never the signed-in app.
const root = document.querySelector<HTMLElement>(
  "[data-web-chat-root][data-guest-chat]",
);

if (root) {
  createRoot(root).render(
    <GuestApp
      name={root.getAttribute("data-guest-name") ?? "the Brain"}
      siteLabel={root.getAttribute("data-guest-label") ?? "Brain"}
    />,
  );
}
