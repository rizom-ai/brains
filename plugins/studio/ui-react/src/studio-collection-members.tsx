/** @jsxImportSource react */
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { studioEntityPath } from "../../src/studio-paths";
import type { CollectionMembersPage } from "./api";
import { isPlainLinkClick } from "./link-click";
import { useStudioApi } from "./studio-api-context";
import { collectionMemberStyles as styles } from "./studio-collection-members.styles";
import { editorClassName, editorStyles } from "./studio-editor.styles";
import { libraryStyles } from "./studio-library.styles";
import { getStudioRouterBasePath } from "./studio-router";
import { typographyStyles } from "./studio-typography.styles";
import { entityTitle, formatUpdated } from "./ui-utils";

/** The entries an opened collection holds, each a link that opens it. */
export function CollectionMembersList(props: {
  page: CollectionMembersPage;
  onOpen: (entityId: string, entityType: string) => void;
}): ReactElement {
  const { page } = props;
  return (
    <section
      data-studio-collection-members=""
      aria-labelledby="studio-collection-members"
      className={editorClassName("", styles.section)}
    >
      <div className={editorClassName("", styles.head)}>
        <h2
          id="studio-collection-members"
          className={editorClassName("", typographyStyles.eyebrow)}
        >
          Members
        </h2>
        <span className={editorClassName("", styles.count)}>{page.label}</span>
      </div>
      {page.entities.map((entity, index) => (
        <a
          key={JSON.stringify([entity.entityType, entity.id])}
          href={studioEntityPath(
            getStudioRouterBasePath(),
            entity.entityType,
            entity.id,
          )}
          data-studio-record=""
          className={editorClassName(
            "",
            libraryStyles.row,
            libraryStyles.recordLink,
            editorStyles.listingRow,
          )}
          onClick={(event) => {
            if (!isPlainLinkClick(event)) return;
            event.preventDefault();
            props.onOpen(entity.id, entity.entityType);
          }}
        >
          <span className={editorClassName("", libraryStyles.index)}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            className={editorClassName("", libraryStyles.title)}
            title={entity.id}
          >
            {entityTitle(entity, entity.path?.at(-1))}
          </span>
          <time
            className={editorClassName("", libraryStyles.updated)}
            dateTime={entity.updated}
          >
            {formatUpdated(entity.updated)}
          </time>
        </a>
      ))}
    </section>
  );
}

/** An opened collection's members, read once it is open; nothing while loading. */
export function StudioCollectionMembers(props: {
  entityType: string;
  entityId: string;
  onOpen: (entityId: string, entityType: string) => void;
}): ReactElement | null {
  const api = useStudioApi();
  const { data } = useQuery({
    queryKey: [
      "studio",
      "collection-members",
      props.entityType,
      props.entityId,
    ],
    queryFn: () => api.fetchCollectionMembers(props.entityType, props.entityId),
  });
  return data ? (
    <CollectionMembersList page={data} onOpen={props.onOpen} />
  ) : null;
}
