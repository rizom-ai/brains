import { Modal, Setting, type App } from "obsidian";
import type {
  DeleteDecision,
  FileNote,
  FirstSyncPlan,
  OpenConflict,
} from "../engine";
import { compareVersions, type ComparedLine } from "./compare";

function list(container: HTMLElement, title: string, items: string[]): void {
  if (items.length === 0) return;
  container.createEl("h4", { text: `${title} (${items.length})` });
  const ul = container.createEl("ul", { cls: "rizom-brain-list" });
  for (const item of items.slice(0, 50)) ul.createEl("li", { text: item });
  if (items.length > 50) {
    ul.createEl("li", { text: `…and ${items.length - 50} more` });
  }
}

/** What the first sync of this vault will do; nothing happens before a yes. */
export class FirstSyncModal extends Modal {
  private readonly plan: FirstSyncPlan;
  private readonly onConfirm: () => void;
  private readonly onClosed: () => void;

  constructor(
    app: App,
    plan: FirstSyncPlan,
    onConfirm: () => void,
    onClosed: () => void,
  ) {
    super(app);
    this.plan = plan;
    this.onConfirm = onConfirm;
    this.onClosed = onClosed;
  }

  override onOpen(): void {
    const { contentEl, plan } = this;
    this.setTitle("Start syncing with your brain");
    contentEl.createEl("p", {
      text: "This is what the first sync will do. Nothing changes until you start it.",
    });
    list(contentEl, "Download from your brain", plan.download);
    list(contentEl, "Upload to your brain", plan.upload);
    list(contentEl, "Already the same", plan.agreed);
    list(
      contentEl,
      "Different in your brain: your brain's version replaces the file here, and this vault's version is kept in Conflicts/",
      plan.replace,
    );
    list(
      contentEl,
      "Stays in this vault only",
      plan.localOnly.map((file) => file.path),
    );
    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText("Not now").onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setButtonText("Start syncing")
          .setCta()
          .onClick(() => {
            this.close();
            this.onConfirm();
          }),
      );
  }

  override onClose(): void {
    this.contentEl.empty();
    this.onClosed();
  }
}

export interface DeleteAnswer {
  localMissing?: { paths: string[]; action: "delete" | "restore" };
  remoteGone?: { paths: string[]; action: "trash" | "keep" };
}

/** Deletions a sync did not make on its own. */
export class DeletesModal extends Modal {
  private readonly decision: DeleteDecision;
  private readonly onAnswer: (answer: DeleteAnswer) => void;
  private readonly onClosed: () => void;

  constructor(
    app: App,
    decision: DeleteDecision,
    onAnswer: (answer: DeleteAnswer) => void,
    onClosed: () => void,
  ) {
    super(app);
    this.decision = decision;
    this.onAnswer = onAnswer;
    this.onClosed = onClosed;
  }

  override onOpen(): void {
    const { contentEl, decision } = this;
    this.setTitle("Delete these files?");
    const missing = decision.localMissing;
    const gone = decision.remoteGone;
    if (missing.length > 0) {
      contentEl.createEl("p", {
        text: "These files are gone from this vault. Delete them in your brain too, or bring them back here?",
      });
      list(contentEl, "Gone from this vault", missing);
      new Setting(contentEl)
        .addButton((button) =>
          button.setButtonText("Bring them back").onClick(() => {
            this.close();
            this.onAnswer({
              localMissing: { paths: missing, action: "restore" },
            });
          }),
        )
        .addButton((button) =>
          button
            .setButtonText("Delete in my brain")
            .setClass("mod-warning")
            .onClick(() => {
              this.close();
              this.onAnswer({
                localMissing: { paths: missing, action: "delete" },
              });
            }),
        );
    }
    if (gone.length > 0) {
      contentEl.createEl("p", {
        text: "These entries were deleted in your brain. Move them to the trash here too, or keep them and send them back?",
      });
      list(contentEl, "Deleted in your brain", gone);
      new Setting(contentEl)
        .addButton((button) =>
          button.setButtonText("Keep and send back").onClick(() => {
            this.close();
            this.onAnswer({ remoteGone: { paths: gone, action: "keep" } });
          }),
        )
        .addButton((button) =>
          button
            .setButtonText("Move to trash")
            .setClass("mod-warning")
            .onClick(() => {
              this.close();
              this.onAnswer({ remoteGone: { paths: gone, action: "trash" } });
            }),
        );
    }
  }

  override onClose(): void {
    this.contentEl.empty();
    this.onClosed();
  }
}

/** The files that are not synced, and why. */
export class FilesModal extends Modal {
  private readonly issues: FileNote[];
  private readonly localOnly: FileNote[];

  constructor(app: App, issues: FileNote[], localOnly: FileNote[]) {
    super(app);
    this.issues = issues;
    this.localOnly = localOnly;
  }

  override onOpen(): void {
    const { contentEl } = this;
    this.setTitle("Files that are not synced");
    if (this.issues.length === 0 && this.localOnly.length === 0) {
      contentEl.createEl("p", {
        text: "Every file is in step with your brain.",
      });
      return;
    }
    const section = (title: string, notes: FileNote[]): void => {
      if (notes.length === 0) return;
      contentEl.createEl("h4", { text: `${title} (${notes.length})` });
      const ul = contentEl.createEl("ul", { cls: "rizom-brain-list" });
      for (const note of notes) {
        const li = ul.createEl("li");
        li.createEl("strong", { text: note.path });
        li.createEl("div", { text: note.reason, cls: "rizom-brain-reason" });
      }
    };
    section("Your brain did not take these", this.issues);
    section("These stay in this vault only", this.localOnly);
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

/** A no-break space: what an empty line holds, so it keeps its height. */
const BLANK = String.fromCodePoint(0xa0);

/**
 * Conflicts waiting for the person, one at a time: the brain's version and
 * theirs side by side, and a button for each. Closing decides nothing.
 */
export class ConflictModal extends Modal {
  private waiting: OpenConflict[];
  private readonly total: number;
  private readonly onChoose: (
    conflict: OpenConflict,
    keep: "brain" | "mine",
  ) => void;
  private readonly onClosed: () => void;

  constructor(
    app: App,
    conflicts: OpenConflict[],
    onChoose: (conflict: OpenConflict, keep: "brain" | "mine") => void,
    onClosed: () => void,
  ) {
    super(app);
    this.waiting = conflicts;
    this.total = conflicts.length;
    this.onChoose = onChoose;
    this.onClosed = onClosed;
  }

  override onOpen(): void {
    this.modalEl.addClass("rizom-brain-conflict-modal");
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    const [conflict] = this.waiting;
    if (!conflict) {
      this.close();
      return;
    }
    this.setTitle(`${conflict.path} was changed in both places`);
    const position = this.total - this.waiting.length + 1;
    contentEl.createEl("p", {
      text:
        (this.total > 1 ? `Conflict ${position} of ${this.total}. ` : "") +
        "Your brain's version is in the note now. Yours is kept until you choose.",
      cls: "rizom-brain-reason",
    });

    if (conflict.flavor === "text" && conflict.yours !== undefined) {
      const compared = compareVersions(conflict.brains ?? "", conflict.yours);
      const versions = contentEl.createDiv({ cls: "rizom-brain-compare" });
      this.version(
        versions,
        "In your brain",
        conflict.brains === undefined
          ? "This note is no longer in the vault."
          : conflict.path,
        compared.brains,
      );
      this.version(versions, "Yours", conflict.copy, compared.yours);
    } else {
      contentEl.createEl("p", {
        text: `This is not a text file, so it cannot be shown here. Your brain's version is ${conflict.path}; yours is ${conflict.copy}. Open both to compare.`,
      });
    }

    const choose = (keep: "brain" | "mine"): void => {
      this.waiting = this.waiting.slice(1);
      this.onChoose(conflict, keep);
      this.render();
    };
    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText("Decide later").onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setButtonText("Keep your brain's version")
          .onClick(() => choose("brain")),
      )
      .addButton((button) =>
        button
          .setButtonText("Keep your version")
          .setCta()
          .onClick(() => choose("mine")),
      );
  }

  private version(
    container: HTMLElement,
    title: string,
    where: string,
    lines: ComparedLine[],
  ): void {
    const column = container.createDiv({ cls: "rizom-brain-version" });
    column.createEl("h4", { text: title });
    column.createDiv({ text: where, cls: "rizom-brain-reason" });
    const text = column.createDiv({ cls: "rizom-brain-version-text" });
    for (const line of lines) {
      text.createDiv({
        text: line.text === "" ? BLANK : line.text,
        ...(line.differs && { cls: "rizom-brain-differs" }),
      });
    }
  }

  override onClose(): void {
    this.contentEl.empty();
    this.onClosed();
  }
}
