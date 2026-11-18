import { mcpServerName, type AiToolClient } from "./ai-tool-clients";

/** One client's steps for mounting the drive. */
export type DriveClient = Omit<AiToolClient, "id" | "group"> & {
  id: "macos" | "windows" | "gnome-files" | "rclone";
  /** File managers are always shown; the command line sits in one closed section. */
  group: "file-manager" | "command-line";
};

const credentials =
  "Enter the username and password of an app password from this page.";

/**
 * How each client mounts the brain's drive: the file manager of each
 * desktop first, then the command line for people who prefer it.
 */
export function driveClients(address: string): readonly DriveClient[] {
  const url = new URL(address);
  // GNOME names WebDAV over TLS `davs` and plain WebDAV `dav`.
  const gnomeAddress = `${url.protocol === "https:" ? "davs" : "dav"}://${url.host}${url.pathname}`;
  const name = mcpServerName(address);
  return [
    {
      id: "macos",
      group: "file-manager",
      name: "macOS",
      note: ["Finder, on any Mac."],
      steps: [
        ["In Finder, choose Go → Connect to Server (⌘K)."],
        ["Paste the address below and click Connect."],
        ["Choose Registered User. ", credentials],
      ],
      snippet: { label: "macOS address", code: address },
    },
    {
      id: "windows",
      group: "file-manager",
      name: "Windows",
      note: ["File Explorer, on Windows 10 and 11."],
      steps: [
        ["In File Explorer, open This PC and choose Map network drive."],
        [
          "Paste the address below as the folder, tick Connect using different credentials, and click Finish.",
        ],
        [credentials],
      ],
      snippet: { label: "Windows address", code: address },
    },
    {
      id: "gnome-files",
      group: "file-manager",
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
      group: "command-line",
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
