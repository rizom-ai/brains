/** @jsxImportSource react */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  buttonClassName,
} from "@brains/app-ui-react";
import type { ReactElement } from "react";
import type { StudioAppViewProps } from "./app-view-props";
import { derivePipeline, PipelineStations } from "./editor-status";

/** Actions on the open entry that are not its save, beside that save. */
export function StudioDocumentMenu(props: {
  onDelete: () => void;
}): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={buttonClassName("ghost", "icon")}
        aria-label="More document actions"
      >
        •••
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onSelect={props.onDelete}>
          Delete entry
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Where the entry stands between the brain, its file and Git: detail kept
 * with its Properties rather than in the footer's one line.
 */
export function StudioSyncDetails(
  props: Pick<StudioAppViewProps, "syncStatus" | "baselineCommit" | "editor">,
): ReactElement | null {
  const { syncStatus } = props;
  if (!syncStatus?.directorySync) return null;
  return (
    <details data-studio-sync-details="">
      <summary>Sync details</summary>
      <PipelineStations
        view={derivePipeline({
          save: props.editor.save,
          git: syncStatus.git,
          baselineCommit: props.baselineCommit,
        })}
        gitConfigured={syncStatus.git !== null}
      />
    </details>
  );
}
