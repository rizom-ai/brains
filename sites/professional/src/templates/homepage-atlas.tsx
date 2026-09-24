import type { JSX } from "react";
import { MarkdownContent, renderHighlightedText } from "@brains/ui-library";
import type { HomepageOpeningContent } from "../schemas/homepage-opening";
import type { HomepageAtlasData } from "../schemas/homepage-atlas";
import { atlasPosition, buildAtlasTerrain } from "../lib/atlas-terrain";
import { layoutZoneLabels } from "../lib/atlas-labels";
import { homepageAtlasStyles } from "./homepage-atlas-styles";

const KIND_ORDER = ["post", "deck", "project"] as const;

function initials(owner: string): string {
  return owner
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

/** Title cards open inward near either edge so they stay on screen. */
function edgeClass(x: number): string {
  if (x > 0.72) return " atlas__mark--west";
  if (x < 0.28) return " atlas__mark--east";
  return "";
}

function AtlasMap({
  atlas,
  caption,
}: {
  atlas: HomepageAtlasData;
  caption: string | null;
}): JSX.Element {
  const contours = buildAtlasTerrain(atlas);
  const labelTops = layoutZoneLabels(atlas.zones, atlas.items);
  const legend = KIND_ORDER.flatMap((kind) => {
    const label = atlas.items.find(
      (item) => item.entityType === kind && item.typeLabel,
    )?.typeLabel;
    return label ? [{ kind, label }] : [];
  });

  return (
    <div
      className="atlas__map"
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
        {atlas.zones.map((zone) => (
          <span
            key={zone.id}
            className="atlas__zone"
            aria-hidden="true"
            style={{
              left: `${atlasPosition(zone.x)}%`,
              top: `${labelTops[zone.id] ?? 7}%`,
            }}
          >
            {zone.name}
          </span>
        ))}
        <ul className="atlas__marks">
          {atlas.items.map((item) => {
            const meta = [item.typeLabel, item.year].filter(Boolean).join(", ");
            return (
              <li
                key={`${item.entityType}:${item.id}`}
                data-atlas-mark=""
                className={`atlas__mark atlas__mark--${item.entityType}${edgeClass(item.x)}`}
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
                    </span>
                  </a>
                ) : (
                  <span title={item.title}>
                    <i className="atlas__glyph" aria-hidden="true" />
                  </span>
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
}: {
  opening: HomepageOpeningContent;
  atlas: HomepageAtlasData | null;
  owner: string;
}): JSX.Element {
  return (
    <section
      className={atlas ? "atlas" : "atlas atlas--bare"}
      data-atlas=""
      aria-label="Introduction"
    >
      <style>{homepageAtlasStyles}</style>
      <div className="atlas__talk">
        {owner && (
          <p className="atlas__byline">
            <span className="atlas__initials" aria-hidden="true">
              {initials(owner)}
            </span>
            <span>
              <b>{owner}</b>
              {opening.attribution && <small>{opening.attribution}</small>}
            </span>
          </p>
        )}
        {opening.title && (
          <h1>{renderHighlightedText(opening.title, "atlas__emphasis")}</h1>
        )}
        {opening.introduction && (
          <MarkdownContent
            markdown={opening.introduction}
            className="atlas__prose"
          />
        )}
        <div className="atlas__door">
          {opening.topicsHeading && <h2>{opening.topicsHeading}</h2>}
          {opening.topics.length > 0 && (
            <ul className="atlas__topics" aria-label="Conversation topics">
              {opening.topics.map((topic, index) => (
                <li key={`${index}-${topic}`}>
                  <a href={opening.contactUrl}>{topic}</a>
                </li>
              ))}
            </ul>
          )}
          <a className="atlas__contact" href={opening.contactUrl}>
            {opening.contactLabel ?? "Contact"}
          </a>
          {opening.contactNote && (
            <p className="atlas__note">{opening.contactNote}</p>
          )}
        </div>
      </div>
      {atlas && <AtlasMap atlas={atlas} caption={opening.mapCaption} />}
    </section>
  );
}
