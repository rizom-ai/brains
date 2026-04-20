/** @jsxImportSource preact */
import type { AppInfo } from "@brains/plugins";
import type { JSX } from "preact";

export function Colophon(props: {
  title: string;
  appInfo: AppInfo;
}): JSX.Element {
  const { title, appInfo } = props;

  return (
    <footer class="colophon">
      <span>{title} · operator console</span>
      <span>v{appInfo.version}</span>
    </footer>
  );
}
