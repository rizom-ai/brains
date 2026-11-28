import type { VaultShape } from "./shapes";

/** One file written from the brain's description of its types. */
export interface GeneratedFile {
  path: string;
  content: string;
  /**
   * The brain's file is kept as the brain writes it; the person's is written
   * once, when missing, and is theirs to change from then on.
   */
  owner: "brain" | "person";
}

/**
 * Files an editor wants in the vault for the brain's types, such as
 * Obsidian's templates and tables. They live in a folder of their own at
 * the top of the vault, and nothing in it is synced.
 */
export interface GeneratedFiles {
  /** Their folder, at the top of the vault. */
  folder: string;
  /** The files the brain's types call for, each under `folder`. */
  files(shapes: readonly VaultShape[]): GeneratedFile[];
  /**
   * Who a file written before belongs to, asked once the brain's types no
   * longer call for it: a person's file they changed is kept.
   */
  ownerOf(path: string): GeneratedFile["owner"];
  /** After the files were written; `first` the first time in this vault. */
  written?(first: boolean): Promise<void>;
}
