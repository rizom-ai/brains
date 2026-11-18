import { mcpServerName, type AiToolClient } from "./ai-tool-clients";

/** One client's steps for mounting the drive. */
export type DriveClient = Omit<AiToolClient, "id" | "group"> & {
  id: "gnome-files" | "rclone";
};

const credentials =
  "Enter the username and password of an app password from this page.";

/**
 * How each client mounts the brain's drive. A client is listed once it has
 * mounted a brain with exactly these steps.
 */
export function driveClients(address: string): readonly DriveClient[] {
  const url = new URL(address);
  // GNOME names WebDAV over TLS `davs` and plain WebDAV `dav`.
  const gnomeAddress = `${url.protocol === "https:" ? "davs" : "dav"}://${url.host}${url.pathname}`;
  const name = mcpServerName(address);
  return [
    {
      id: "gnome-files",
      name: "GNOME Files",
      note: ["The file manager on Ubuntu, Fedora and other GNOME desktops."],
      steps: [
        ["Open Files → Other Locations (or Network)."],
        ["Under Connect to Server, enter the address below and connect."],
        [credentials],
      ],
      snippet: { label: "GNOME Files address", code: gnomeAddress },
    },
    {
      id: "rclone",
      name: "rclone",
      note: ["Linux, macOS and Windows, from a terminal."],
      lead: [
        [
          "Store the drive as a remote, with your app password’s username and password:",
        ],
      ],
      snippet: {
        label: "rclone remote command",
        code: `rclone config create ${name} webdav url=${address} vendor=other user=YOUR_USERNAME pass=YOUR_PASSWORD --obscure`,
      },
      after: [
        [
          "Then mount it on an empty folder: ",
          { code: `rclone mount ${name}: ~/Brain --vfs-cache-mode writes` },
          ".",
        ],
      ],
    },
  ];
}
