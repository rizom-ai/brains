/** @jsxImportSource react */
import { Button, ConfirmDialog } from "@brains/app-ui-react";
import { useState, type ComponentType, type ReactElement } from "react";
import { StudioStatus } from "./studio-status";

export function StudioWorkspaceLoadRecovery({
  onReload = (): void => window.location.reload(),
}: {
  onReload?: () => void;
}): ReactElement {
  const [confirm, setConfirm] = useState(false);
  return (
    <section aria-label="Workspace loading problem">
      <StudioStatus tone="error">
        This workspace could not load. Check your connection; Studio may also
        have been updated.
      </StudioStatus>
      <p>
        Unsaved work will be lost if you reload. Nothing has been reloaded
        automatically.
      </p>
      <Button onClick={() => setConfirm(true)}>Reload Studio</Button>
      {confirm && (
        <ConfirmDialog
          mark="↻"
          title="Reload Studio?"
          titleId="studio-reload-title"
          cancelLabel="Stay"
          confirmLabel="Reload"
          onCancel={() => setConfirm(false)}
          onConfirm={onReload}
        >
          <p>
            This reloads the whole tab and discards unsaved work. Cancel to stay
            in this tab.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

export async function loadStudioWorkspace<Props>(
  load: () => Promise<{ default: ComponentType<Props> }>,
  Recovery: ComponentType<Props> = (): ReactElement => (
    <StudioWorkspaceLoadRecovery />
  ),
): Promise<{ default: ComponentType<Props> }> {
  try {
    return await load();
  } catch {
    // Import/network failures (including retired deployment chunks) become an
    // explicit recovery prompt. Never reload automatically or expose raw URLs.
    // Component render errors are not caught here.
    return { default: Recovery };
  }
}
