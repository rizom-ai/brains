/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { ConfirmDialog, Textarea } from "@brains/app-ui-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import type { EntitySummary, EntityTypeInfo } from "./api";
import { studioKeys } from "./queries";
import {
  pickedInListOrder,
  refineNotice,
  refineQuestion,
  togglePick,
  type RefineNotice,
  type RefineOutcome,
} from "./refine";
import { useStudioApi } from "./studio-api-context";
import { refineStyles as s } from "./studio-refine.styles";
import { StudioStatus } from "./studio-status";
import { editorClassName as editorClass } from "./studio-editor.styles";
import { libraryStyles as library } from "./studio-library.styles";
import { entityTitle, sentenceLabel } from "./ui-utils";
import { getErrorMessage } from "@brains/utils/error";

/** Where the confirmed refine is kept: outside the lists a refresh re-reads. */
const REFINE_OUTCOME_KEY = ["studio-refine", "outcome"] as const;

/** How often the list is read again while the brain writes a refined entry. */
const WRITING_POLL_MS = 3_000;

/**
 * The refine the person last confirmed, followed to its end: kept beside
 * the cached lists so it survives the move to where the refined entry
 * lands, with that list read again until the brain has written it. Once it
 * is written, the picked entries are gone, so their list and the counts
 * are read again too.
 */
export function useRefineOutcome(view: {
  entityType: string | null;
  entities: readonly EntitySummary[] | null;
}): {
  notice: RefineNotice | null;
  confirmed(outcome: RefineOutcome): void;
} {
  const queryClient = useQueryClient();
  const { data: outcome = null } = useQuery({
    queryKey: REFINE_OUTCOME_KEY,
    queryFn: (): RefineOutcome | null =>
      queryClient.getQueryData<RefineOutcome | null>(REFINE_OUTCOME_KEY) ??
      null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  const notice = refineNotice(outcome, view.entityType, view.entities);
  const writing = notice?.state === "writing";
  const settled = notice !== null && !writing;
  const sourceType = outcome?.sourceType;
  const targetType = outcome?.targetType;

  // Read the list again while the brain writes, since nothing announces it.
  useEffect(() => {
    if (!writing || !targetType) return undefined;
    const timer = setInterval(() => {
      void queryClient.invalidateQueries({
        queryKey: studioKeys.entities(targetType),
      });
    }, WRITING_POLL_MS);
    return (): void => clearInterval(timer);
  }, [writing, targetType, queryClient]);

  useEffect(() => {
    if (!settled || !sourceType) return;
    void queryClient.invalidateQueries({
      queryKey: studioKeys.entities(sourceType),
    });
    void queryClient.invalidateQueries({ queryKey: studioKeys.navigation() });
  }, [settled, sourceType, queryClient]);

  const confirmed = useCallback(
    (next: RefineOutcome): void => {
      queryClient.setQueryData(REFINE_OUTCOME_KEY, next);
      void queryClient.invalidateQueries({
        queryKey: studioKeys.entities(next.targetType),
      });
      void queryClient.invalidateQueries({ queryKey: studioKeys.navigation() });
    },
    [queryClient],
  );

  return { notice, confirmed };
}

/** What the library needs to offer Refine on the collection it shows. */
export interface StudioRefine {
  /** Whether this collection's entries can be refined by this person. */
  available: boolean;
  /** The picked ids, in the order the list shows them. */
  picked: readonly string[];
  toggle(id: string): void;
  clear(): void;
  /** Whether the confirmation is open. */
  asking: boolean;
  ask(): void;
  closeAsk(): void;
  /** A refine was confirmed: its placeholder is being written. */
  confirmed(entityId: string): void;
  /** The brain refused: the confirmation closes and its reason is shown. */
  refused(why: string): void;
  /** Why the brain refused the last refine asked for here, if it did. */
  refusal: string | null;
}

/**
 * Picking in the collection the library shows. The picks belong to one
 * page of one collection; a confirmed refine is handed on to whoever
 * follows it to its end.
 */
export function useStudioRefine(view: {
  activeType: EntityTypeInfo | undefined;
  entityType: string | null;
  entities: readonly EntitySummary[] | null;
  entityOffset: number;
  entryLabel: string;
  collectionLabel: string;
  onConfirmed: ((outcome: RefineOutcome) => void) | undefined;
}): StudioRefine {
  const { activeType, entityType, entities, entityOffset, onConfirmed } = view;
  const [picks, setPicks] = useState<readonly string[]>([]);
  const [asking, setAsking] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const target = activeType?.refinesInto;

  // Picks belong to the page of the collection they were made on.
  useEffect(() => {
    setPicks([]);
    setAsking(false);
    setRefusal(null);
  }, [entityType, entityOffset]);

  const refused = useCallback((why: string): void => {
    setRefusal(why);
    setAsking(false);
  }, []);

  const picked = useMemo(
    () => pickedInListOrder(picks, entities ?? []),
    [picks, entities],
  );

  const confirmed = useCallback(
    (entityId: string): void => {
      if (!entityType || !target) return;
      onConfirmed?.({
        sourceType: entityType,
        entryLabel: view.entryLabel,
        sourceLabel: view.collectionLabel,
        count: picked.length,
        targetType: target.entityType,
        targetLabel: target.label,
        entityId,
      });
      setPicks([]);
      setAsking(false);
    },
    [
      entityType,
      target,
      picked.length,
      view.entryLabel,
      view.collectionLabel,
      onConfirmed,
    ],
  );

  return {
    available: target !== undefined,
    picked,
    toggle: (id): void => {
      setRefusal(null);
      setPicks((current) => togglePick(current, id));
    },
    clear: (): void => {
      setRefusal(null);
      setPicks([]);
    },
    asking,
    ask: (): void => {
      setRefusal(null);
      setAsking(true);
    },
    closeAsk: (): void => setAsking(false),
    confirmed,
    refused,
    refusal,
  };
}

/**
 * The mark a row is picked with: it stands where the row's number stands,
 * and is the number until the row is hovered, focused or others are picked.
 */
export function RefineMark(props: {
  index: string;
  title: string;
  picked: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.picked}
      aria-label={`Pick ${props.title}`}
      data-studio-pick=""
      {...stylex.props(s.mark)}
      onClick={props.onToggle}
    >
      <span className={editorClass("", library.index, s.number)}>
        {props.index}
      </span>
      <span
        aria-hidden="true"
        {...stylex.props(s.box, props.picked && s.boxPicked)}
      >
        {props.picked ? "✓" : ""}
      </span>
    </button>
  );
}

/** What Studio says where a confirmed refine lands. */
export function RefineNoticeLine(props: {
  notice: RefineNotice | null;
}): ReactElement | null {
  if (!props.notice) return null;
  return (
    <StudioStatus
      tone={
        props.notice.tone === "error"
          ? "error"
          : props.notice.tone === "success"
            ? "good"
            : undefined
      }
      className={editorClass("", s.notice)}
    >
      <span data-studio-refine-notice={props.notice.state}>
        {props.notice.text}
      </span>
    </StudioStatus>
  );
}

/**
 * The one confirmation: it asks the brain what refining these entries will
 * do, names every one of them and says they will be removed. Nothing is
 * written or removed before Refine. A refusal closes it and is reported in
 * the brain's own words, with nothing left to confirm.
 */
export function RefineDialog(props: {
  entityType: string;
  entryLabel: string;
  collectionLabel: string;
  /** What one refined entry is called, e.g. "Refined Note". */
  targetLabel: string;
  picked: readonly EntitySummary[];
  onCancel: () => void;
  onRefused: (why: string) => void;
  onConfirmed: (entityId: string) => void;
}): ReactElement {
  const api = useStudioApi();
  const titleId = useId();
  const directionId = useId();
  const [approval, setApproval] = useState<Record<string, unknown> | null>(
    null,
  );
  const [direction, setDirection] = useState("");
  const [running, setRunning] = useState(false);
  const { entityType, picked, onConfirmed, onRefused } = props;
  const ids = useMemo(() => picked.map(({ id }) => id), [picked]);
  const count = picked.length;

  // Ask the brain once the dialog opens: its answer is what Refine runs.
  useEffect(() => {
    let current = true;
    api.refine({ entityType, ids }).then(
      (answer) => {
        if (current && answer.status === "confirm") {
          setApproval(answer.approval);
        }
      },
      (error: unknown) => {
        if (current) onRefused(reason(error));
      },
    );
    return (): void => {
      current = false;
    };
  }, [api, entityType, ids, onRefused]);

  const run = (): void => {
    if (!approval || running) return;
    setRunning(true);
    const stated = direction.trim();
    const asked = { entityType, ids, ...(stated && { direction: stated }) };
    // The brain runs exactly what it approved, and it approved the picked
    // entries before any direction was stated: one stated since is asked for.
    const approved = stated
      ? api
          .refine(asked)
          .then((answer) =>
            answer.status === "confirm" ? answer.approval : approval,
          )
      : Promise.resolve(approval);
    approved
      .then((given) => api.refine({ ...asked, approval: given }))
      .then(
        (answer) => {
          if (answer.status === "queued") onConfirmed(answer.entityId);
          else setRunning(false);
        },
        (error: unknown) => onRefused(reason(error)),
      );
  };

  return (
    <ConfirmDialog
      mark="◇"
      title={refineQuestion(count, props.entryLabel, props.collectionLabel)}
      titleId={titleId}
      cancelLabel="Cancel"
      confirmLabel={
        running ? "Refining…" : approval === null ? "Checking…" : "Refine"
      }
      pending={running}
      onCancel={props.onCancel}
      onConfirm={run}
    >
      <p>
        The brain writes one {sentenceLabel(props.targetLabel)} from{" "}
        {count === 1 ? "it. It" : "them. They"} will be removed once it is
        saved.
      </p>
      <ol {...stylex.props(s.picked)}>
        {picked.map((entity, index) => (
          <li key={entity.id} {...stylex.props(s.pickedItem)}>
            <span {...stylex.props(s.pickedIndex)}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>{entityTitle(entity)}</span>
          </li>
        ))}
      </ol>
      <label htmlFor={directionId} {...stylex.props(s.direction)}>
        <span {...stylex.props(s.directionLabel)}>Direction · optional</span>
        <Textarea
          id={directionId}
          rows={2}
          maxLength={2000}
          placeholder="What should it focus on?"
          value={direction}
          disabled={running}
          onInput={(event) => setDirection(event.currentTarget.value)}
          onChange={(event) => setDirection(event.currentTarget.value)}
        />
      </label>
    </ConfirmDialog>
  );
}

/** Why the brain refused, in its own words. */
function reason(error: unknown): string {
  return getErrorMessage(error);
}
