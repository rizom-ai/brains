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
  SeminarDetailTemplate,
  type SeminarDetailProps,
} from "../templates/seminar-detail";
import {
  SeminarListTemplate,
  type SeminarListProps,
} from "../templates/seminar-list";

/** The pages a site reads seminars on, over seminar:entities. */
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
  };
}
