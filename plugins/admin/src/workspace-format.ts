const workspaceDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

export function formatWorkspaceDate(timestamp: number): string {
  return workspaceDateFormatter.format(new Date(timestamp));
}
