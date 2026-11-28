import {
  createTemplate,
  type Template,
} from "@brains/sdk/internal/presentation";
import {
  seminarDetailPageSchema,
  seminarListPageSchema,
  type SeminarDetailPage,
  type SeminarListPage,
} from "../datasources/seminar-datasource";
import {
  seminarAskPageSchema,
  type SeminarAskPage,
} from "../datasources/seminar-ask-datasource";
import {
  noteDetailPageSchema,
  noteListPageSchema,
  type NoteDetailPage,
  type NoteListPage,
} from "../datasources/seminar-notes-datasource";
import {
  NoteDetailTemplate,
  type NoteDetailProps,
} from "../templates/note-detail";
import { NoteListTemplate, type NoteListProps } from "../templates/note-list";
import {
  SeminarAskTemplate,
  type SeminarAskProps,
} from "../templates/seminar-ask";
import {
  SeminarDetailTemplate,
  type SeminarDetailProps,
} from "../templates/seminar-detail";
import {
  SeminarListTemplate,
  type SeminarListProps,
} from "../templates/seminar-list";

/** The pages a site reads seminars on, over seminar:entities, and its Ask page. */
export function getTemplates(): Record<string, Template> {
  return {
    "seminar-list": createTemplate<SeminarListPage, SeminarListProps>({
      name: "seminar-list",
      description: "The seminars a brain has held, newest first",
      schema: seminarListPageSchema,
      dataSourceId: "seminar:entities",
      requiredPermission: "public",
      layout: { component: SeminarListTemplate },
    }),
    "seminar-detail": createTemplate<SeminarDetailPage, SeminarDetailProps>({
      name: "seminar-detail",
      description:
        "One seminar: the openings, the chair's turn, the challenges, the rejoinder and where they meet",
      schema: seminarDetailPageSchema,
      dataSourceId: "seminar:entities",
      requiredPermission: "public",
      layout: { component: SeminarDetailTemplate },
    }),
    // The note type has no pages of its own; these names give it some on a
    // brain that holds seminars.
    "note-list": createTemplate<NoteListPage, NoteListProps>({
      name: "note-list",
      description: "The brain's own notes, by title",
      schema: noteListPageSchema,
      dataSourceId: "seminar:notes",
      requiredPermission: "public",
      layout: { component: NoteListTemplate },
    }),
    "note-detail": createTemplate<NoteDetailPage, NoteDetailProps>({
      name: "note-detail",
      description: "One of the brain's own notes, as written",
      schema: noteDetailPageSchema,
      dataSourceId: "seminar:notes",
      requiredPermission: "public",
      layout: { component: NoteDetailTemplate },
    }),
    ask: createTemplate<SeminarAskPage, SeminarAskProps>({
      name: "ask",
      description: "Asking a brain that holds seminars",
      schema: seminarAskPageSchema,
      dataSourceId: "seminar:ask",
      requiredPermission: "public",
      layout: { component: SeminarAskTemplate },
    }),
  };
}
