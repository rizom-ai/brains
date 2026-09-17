/** Web Chat owns this mount; the dashboard owns selection and surrounding chrome. */
import { mountGuestBox } from "./guest-box";
import "./guest-dashboard.css";

const root = document.querySelector<HTMLElement>("[data-guest-dashboard]");
const tab = document.getElementById("dashboard-tab-ask");
if (root && tab) {
  let mounted = false;
  const observer = new MutationObserver(mountWhenSelected);
  function mountWhenSelected(): void {
    if (
      !root ||
      !tab ||
      mounted ||
      tab.getAttribute("aria-selected") !== "true"
    )
      return;
    mounted = true;
    observer.disconnect();
    mountGuestBox(root);
  }
  observer.observe(tab, {
    attributes: true,
    attributeFilter: ["aria-selected"],
  });
  mountWhenSelected();
}
