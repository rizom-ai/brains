import { ItemView, type TFile, type WorkspaceLeaf } from "obsidian";
import type { RelatedAnswer, RelatedNote } from "../engine";

export const RELATED_VIEW = "rizom-brain-related";

/** How long an answer is shown again without asking: ten minutes. */
const KEEP_MS = 10 * 60_000;

/** What the panel says when there is no list to show. */
const SAYS: Record<Exclude<RelatedAnswer["status"], "ok">, string> = {
  "not-in-brain":
    "This file is not in your brain, so there is nothing to relate it to.",
  "old-brain":
    "Your brain is from before it could tell what is related. Update it to use this.",
  "no-index":
    "Your brain keeps no index of meaning, so it cannot tell what is related.",
  offline: "Your brain cannot be reached.",
  unavailable: "Your brain is not answering for now.",
  "signed-out":
    "Your brain did not accept the app password. Connect again in the Rizom Brain settings.",
};

interface Kept {
  at: number;
  /** The file's modification time when it was asked about. */
  mtime: number;
  entries: RelatedNote[];
}

/**
 * A side panel: the entries the brain holds nearest to the open note,
 * nearest first. One the vault holds opens on a click.
 */
export class RelatedView extends ItemView {
  private readonly ask: (path: string) => Promise<RelatedAnswer | undefined>;
  private readonly kept = new Map<string, Kept>();
  /** The file shown; a later answer for an earlier file is dropped. */
  private showing: string | undefined;

  constructor(
    leaf: WorkspaceLeaf,
    ask: (path: string) => Promise<RelatedAnswer | undefined>,
  ) {
    super(leaf);
    this.ask = ask;
  }

  override getViewType(): string {
    return RELATED_VIEW;
  }

  override getDisplayText(): string {
    return "Related in your brain";
  }

  override getIcon(): string {
    return "waypoints";
  }

  override async onOpen(): Promise<void> {
    await this.show(this.app.workspace.getActiveFile());
  }

  /** Show what relates to a file; the answer of a moment ago is not asked again. */
  async show(file: TFile | null): Promise<void> {
    this.showing = file?.path;
    if (!file) {
      this.say("Open a note to see what your brain relates to it.");
      return;
    }
    const kept = this.kept.get(file.path);
    if (kept?.mtime === file.stat.mtime && Date.now() - kept.at < KEEP_MS) {
      this.list(file, kept.entries);
      return;
    }
    this.say("Asking your brain…", file);
    const answer = await this.ask(file.path);
    // Another file was opened while the brain was asked.
    if (this.showing !== file.path) return;
    if (!answer) {
      this.say("Connect to your brain in the Rizom Brain settings first.");
      return;
    }
    if (answer.status === "ok") {
      this.kept.set(file.path, {
        at: Date.now(),
        mtime: file.stat.mtime,
        entries: answer.entries,
      });
      this.list(file, answer.entries);
      return;
    }
    // Out of reach: what was known is still worth showing.
    this.say(SAYS[answer.status], file);
    if (kept && answer.status !== "not-in-brain") {
      this.entries(kept.entries, file);
    }
  }

  private heading(file?: TFile): void {
    this.contentEl.empty();
    this.contentEl.addClass("rizom-brain-related");
    if (file) {
      this.contentEl.createDiv({
        text: `Related to ${file.basename}`,
        cls: "rizom-brain-related-title",
      });
    }
  }

  private say(text: string, file?: TFile): void {
    this.heading(file);
    this.contentEl.createDiv({ text, cls: "rizom-brain-reason" });
  }

  private list(file: TFile, entries: RelatedNote[]): void {
    this.heading(file);
    if (entries.length === 0) {
      this.contentEl.createDiv({
        text: "Your brain holds nothing close to this note yet.",
        cls: "rizom-brain-reason",
      });
      return;
    }
    this.entries(entries, file);
  }

  private entries(entries: RelatedNote[], file: TFile): void {
    const list = this.contentEl.createDiv({ cls: "rizom-brain-related-list" });
    for (const entry of entries) {
      const row = list.createDiv({ cls: "rizom-brain-related-row" });
      if (entry.inVault) {
        const link = row.createEl("a", {
          text: entry.title,
          cls: "rizom-brain-related-link",
        });
        link.addEventListener("click", (event) => {
          void this.app.workspace.openLinkText(
            entry.path,
            file.path,
            event.ctrlKey || event.metaKey,
          );
        });
      } else {
        // In the brain, but of a type this vault does not hold.
        row.createSpan({ text: entry.title });
      }
      row.createSpan({
        text: entry.entityType,
        cls: "rizom-brain-related-type",
      });
    }
  }
}
