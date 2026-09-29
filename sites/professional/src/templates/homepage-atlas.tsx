import type { CSSProperties, JSX } from "react";
import { MarkdownContent, renderHighlightedText } from "@brains/ui-library";
import type { HomepageOpeningContent } from "../schemas/homepage-opening";
import type { HomepageAtlasData } from "../schemas/homepage-atlas";
import { atlasPosition, buildAtlasTerrain } from "../lib/atlas-terrain";
import { layoutZoneLabels, type LabelPlacement } from "../lib/atlas-labels";
import {
  ASK_BOX_ATTRIBUTE,
  ASK_BOX_SCRIPT_PATH,
  ASK_NAME_ATTRIBUTE,
  ASK_PLACEHOLDER_ATTRIBUTE,
  ASK_SEND_ATTRIBUTE,
  ASK_STATUS_ATTRIBUTE,
  ASK_STYLED_ATTRIBUTE,
} from "@brains/contracts";
import { homepageAtlasStyles } from "./homepage-atlas-styles";

const KIND_ORDER = ["post", "deck", "project"] as const;

/** What the empty box asks for, in the opening's own first person. */
const ASK_PLACEHOLDER = "Ask about my work…";

/** The contact form starts the visitor's message with the topic they chose. */
function topicUrl(contactUrl: string, topic: string): string {
  const separator = contactUrl.includes("?") ? "&" : "?";
  return `${contactUrl}${separator}${new URLSearchParams({ topic }).toString()}`;
}

/**
 * Title cards open inward near either edge, and below a mark near the top,
 * so they stay on the map.
 */
function edgeClass(x: number, top: number): string {
  const south = top < 28 ? " atlas__mark--south" : "";
  if (x > 0.72) return ` atlas__mark--west${south}`;
  if (x < 0.28) return ` atlas__mark--east${south}`;
  return south;
}

/**
 * How far down the field marks and names reach (0.5–1), with room for their
 * rings. Phones start the text there instead of under the empty rest of the
 * map; the whole section carries it so the map and the text both see it.
 */
function atlasFill(
  atlas: HomepageAtlasData,
  labels: Record<string, LabelPlacement>,
): CSSProperties & Record<`--${string}`, string> {
  const reach = Math.max(
    ...atlas.items.map((item) => atlasPosition(item.y)),
    ...Object.values(labels).map((label) => label.bottom),
  );
  return {
    "--atlas-fill": Math.min(1, Math.max(0.5, (reach + 6) / 100)).toFixed(3),
  };
}

function AtlasMap({
  atlas,
  labels,
  caption,
  chat,
}: {
  atlas: HomepageAtlasData;
  labels: Record<string, LabelPlacement>;
  caption: string | null;
  /** Beside a conversation, whose phone view links its sources and pieces. */
  chat: boolean;
}): JSX.Element {
  const contours = buildAtlasTerrain(atlas);
  // Larger territories name themselves first; the label script keeps that order.
  const zones = [...atlas.zones].sort(
    (a, b) => b.members - a.members || a.id.localeCompare(b.id),
  );
  // A map too small for every name hides some; each card still names its territory.
  const zoneNames = new Map(
    atlas.zones.map((zone): [string, string] => [zone.id, zone.name]),
  );
  const legend = KIND_ORDER.flatMap((kind) => {
    const label = atlas.items.find(
      (item) => item.entityType === kind && item.typeLabel,
    )?.typeLabel;
    return label ? [{ kind, label }] : [];
  });

  return (
    <div
      className="atlas__map"
      data-atlas-map=""
      role="group"
      aria-label={caption ?? "Map of published work"}
    >
      <div className="atlas__field" data-atlas-field="">
        <svg
          className="atlas__terrain"
          data-atlas-terrain=""
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {/* Each ring drifts on its own phase, so neighbouring rings slide against each other. */}
          <g className="atlas__contours">
            {contours.map((contour) => (
              <path
                key={contour.step}
                className={
                  contour.index
                    ? "atlas__contour atlas__contour--index"
                    : "atlas__contour"
                }
                strokeOpacity={contour.opacity}
                style={{ animationDelay: `${-contour.step * 2.3}s` }}
                d={contour.d}
              />
            ))}
          </g>
        </svg>
        {zones.map((zone) => (
          <span
            key={zone.id}
            className="atlas__zone"
            data-atlas-zone=""
            aria-hidden="true"
            style={{
              left: `${labels[zone.id]?.left ?? atlasPosition(zone.x)}%`,
              top: `${labels[zone.id]?.bottom ?? 7}%`,
            }}
          >
            {zone.name}
          </span>
        ))}
        <ul className="atlas__marks">
          {atlas.items.map((item) => {
            const meta = [item.typeLabel, item.year].filter(Boolean).join(", ");
            const territory = item.zoneId ? zoneNames.get(item.zoneId) : null;
            return (
              <li
                key={`${item.entityType}:${item.id}`}
                data-atlas-mark=""
                data-atlas-key={`${item.entityType}:${item.id}`}
                {...(item.typeLabel
                  ? { "data-atlas-type": item.typeLabel }
                  : {})}
                {...(item.typeLabel
                  ? { "data-atlas-type": item.typeLabel }
                  : {})}
                className={`atlas__mark atlas__mark--${item.entityType}${edgeClass(item.x, atlasPosition(item.y))}`}
                style={{
                  left: `${atlasPosition(item.x)}%`,
                  top: `${atlasPosition(item.y)}%`,
                }}
              >
                {item.url ? (
                  <a href={item.url}>
                    <i className="atlas__glyph" aria-hidden="true" />
                    <span className="atlas__tip" data-atlas-tip="">
                      <b>{item.title}</b>
                      {meta && <span>{meta}</span>}
                      {territory && <em>{territory}</em>}
                    </span>
                  </a>
                ) : (
                  <span title={item.title}>
                    <i className="atlas__glyph" aria-hidden="true" />
                  </span>
                )}
                {item.url && chat && (
                  <button
                    type="button"
                    className="atlas__cited"
                    data-atlas-cited=""
                  >
                    Where it’s cited ↓
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="atlas__legend">
        {caption && <span className="atlas__caption">{caption}</span>}
        {legend.map(({ kind, label }) => (
          <span key={kind} className={`atlas__key--${kind}`}>
            <i aria-hidden="true" />
            {label}
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * The homepage as the Brain itself: everything published, placed by topic
 * on build-time topographic terrain, with the owner's authored opening and
 * a working door to the contact form floating over it. Every word on the
 * page comes from the authored Ask content; what is not written is left
 * out, and the contact action falls back to a plain label. No scripts. The
 * conversation comes first in the document so keyboard and screen-reader
 * users reach the opening and the door before the map's links.
 */
export function HomepageAtlas({
  opening,
  atlas,
  owner,
  askBox = false,
}: {
  opening: HomepageOpeningContent;
  atlas: HomepageAtlasData | null;
  owner: string;
  /** Guest chat is enabled: dock the shared chat box (see @brains/contracts ask-box). */
  askBox?: boolean;
}): JSX.Element {
  const labels = atlas ? layoutZoneLabels(atlas.zones, atlas.items) : {};
  return (
    <section
      style={atlas ? atlasFill(atlas, labels) : undefined}
      className={[
        "atlas",
        atlas ? "" : "atlas--bare",
        askBox ? "atlas--chat" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-atlas=""
      aria-label="Introduction"
    >
      <style>{homepageAtlasStyles}</style>
      <div className="atlas__talk">
        {opening.title && (
          <h1>{renderHighlightedText(opening.title, "atlas__emphasis")}</h1>
        )}
        {opening.introduction && (
          <MarkdownContent
            markdown={opening.introduction}
            className="atlas__prose"
          />
        )}
        {askBox && (
          // Disabled until Web Chat's box boot enables it; the boot mounts the
          // conversation here and never sends on its own. Web Chat styles the
          // mounted box; the atlas themes and frames it.
          <div
            className="atlas__ask"
            {...{
              [ASK_BOX_ATTRIBUTE]: "",
              [ASK_STYLED_ATTRIBUTE]: "",
              ...(owner ? { [ASK_NAME_ATTRIBUTE]: owner } : {}),
              [ASK_PLACEHOLDER_ATTRIBUTE]: ASK_PLACEHOLDER,
            }}
          >
            <p
              className="atlas__ask-status"
              role="status"
              {...{ [ASK_STATUS_ATTRIBUTE]: "" }}
            />
            <div className="atlas__composer">
              <textarea
                rows={1}
                disabled
                aria-label="Your question"
                placeholder={ASK_PLACEHOLDER}
              />
              <button
                type="button"
                className="atlas__send"
                disabled
                aria-label="Send question"
                {...{ [ASK_SEND_ATTRIBUTE]: "" }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
                </svg>
              </button>
            </div>
          </div>
        )}
        <div className="atlas__door">
          {opening.topicsHeading && <h2>{opening.topicsHeading}</h2>}
          {opening.topics.length > 0 && (
            <ul className="atlas__topics" aria-label="Conversation topics">
              {opening.topics.map((topic, index) => (
                <li key={`${index}-${topic}`}>
                  {/* With chat, a topic fills the draft; without, it reaches the contact form, where it starts the message. */}
                  <a
                    href={topicUrl(opening.contactUrl, topic)}
                    data-atlas-door=""
                    {...(askBox ? { "data-atlas-fill": topic } : {})}
                  >
                    {topic}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <a
            className="atlas__contact"
            href={opening.contactUrl}
            data-atlas-door=""
          >
            {opening.contactLabel ?? "Contact"}
          </a>
          {opening.contactNote && (
            <p className="atlas__note">{opening.contactNote}</p>
          )}
        </div>
      </div>
      {atlas && (
        <AtlasMap
          atlas={atlas}
          labels={labels}
          caption={opening.mapCaption}
          chat={askBox}
        />
      )}
      {atlas && askBox && (
        // Leads from an answer's listed sources to their marks, drawn by the atlas script.
        <svg className="atlas__leads" data-atlas-leads="" aria-hidden="true" />
      )}
      {askBox && <script src={ASK_BOX_SCRIPT_PATH} defer />}
    </section>
  );
}
