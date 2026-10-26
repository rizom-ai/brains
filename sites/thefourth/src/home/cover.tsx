import type { CSSProperties, JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { KEY_SHAPES, KeyDrawing, type KeyShape } from "./keys";

/**
 * The cover: a paper stage between two curtains under a scalloped valance.
 * The headline sets each line's first letter as a red italic initial and a
 * glowing keyhole where the content marks `[key]`; seven keys lie scattered
 * around it. Scrolling lifts the valance, parts the curtains, pulls the keys
 * into the keyhole and steps through it into Act I (see ../styles). The
 * cover script measures how far the keyhole sits from the stage's center,
 * so the keys fly to it wherever the headline wraps.
 */
const coverSchema = z.object({
  lines: z.array(z.string()).min(1),
  lead: z.string(),
  audience: z.string(),
});

const KEY_MARK = "[key]";

/** The keyhole stands in for a letter; this is the letter it reads as. */
const KEYHOLE_LETTER = "i";

interface Key {
  x: string;
  y: string;
  r: string;
  wideOnly: boolean;
  shape: KeyShape;
}

/** The seven keys, placed around the keyhole as the design scatters them. */
const KEYS: Key[] = [
  {
    x: "-24vw",
    y: "-27vh",
    r: "-20deg",
    wideOnly: false,
    shape: KEY_SHAPES.trefoil,
  },
  {
    x: "-5vw",
    y: "-31vh",
    r: "68deg",
    wideOnly: false,
    shape: KEY_SHAPES.ring,
  },
  {
    x: "22vw",
    y: "-25vh",
    r: "14deg",
    wideOnly: false,
    shape: KEY_SHAPES.paddle,
  },
  {
    x: "-27vw",
    y: "13vh",
    r: "58deg",
    wideOnly: true,
    shape: KEY_SHAPES.crown,
  },
  {
    x: "27vw",
    y: "12vh",
    r: "-34deg",
    wideOnly: true,
    shape: KEY_SHAPES.heart,
  },
  {
    x: "-15vw",
    y: "32vh",
    r: "-40deg",
    wideOnly: false,
    shape: KEY_SHAPES.oval,
  },
  {
    x: "13vw",
    y: "33vh",
    r: "25deg",
    wideOnly: false,
    shape: KEY_SHAPES.disc,
  },
];

/** Where a key lies, as the custom properties the suck animation reads. */
type KeyPlacement = CSSProperties & {
  "--x": string;
  "--y": string;
  "--r": string;
};

function keyPlacement(key: Key): KeyPlacement {
  return { "--x": key.x, "--y": key.y, "--r": key.r };
}

/** A line's first letter as the red italic initial, then the rest. */
function Initialed({ text }: { text: string }): JSX.Element {
  return (
    <>
      <span className="tf-initial">{text.slice(0, 1)}</span>
      {text.slice(1)}
    </>
  );
}

function Keyhole(): JSX.Element {
  return (
    <span className="tf-keyhole-slot" data-tf-keyhole="">
      <span className="tf-glow">
        <span className="tf-keyhole tf-zoom" />
      </span>
      <span className="tf-keys" aria-hidden="true">
        {KEYS.map((key) => (
          <span
            key={`${key.x}${key.y}`}
            className={key.wideOnly ? "tf-key-slot tf-hide-sm" : "tf-key-slot"}
          >
            <span className="tf-key" style={keyPlacement(key)}>
              <KeyDrawing shape={key.shape} />
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

/** A headline line, with the keyhole where the content marks it. */
function HeadlineLine({ line }: { line: string }): JSX.Element {
  const at = line.indexOf(KEY_MARK);
  if (at === -1) {
    return (
      <span className="tf-headline__line tf-fadeout">
        <Initialed text={line} />
      </span>
    );
  }
  const before = line.slice(0, at);
  const after = line.slice(at + KEY_MARK.length);
  return (
    <span className="tf-headline__line">
      {before && (
        <span className="tf-fadeout">
          <Initialed text={before} />
        </span>
      )}
      <Keyhole />
      {after && <span className="tf-fadeout">{after}</span>}
    </span>
  );
}

function Valance(): JSX.Element {
  const scallops = Array.from({ length: 8 }, (_, index) => index * 180);
  return (
    <div className="tf-valance" aria-hidden="true">
      <svg viewBox="0 0 1440 140" preserveAspectRatio="none">
        <rect x="0" y="0" width="1440" height="40" />
        {scallops.map((x) => (
          <path key={x} d={`M${x} 36 Q ${x + 90} 132 ${x + 180} 36 Z`} />
        ))}
      </svg>
    </div>
  );
}

function CoverSection({
  lines,
  lead,
  audience,
}: z.infer<typeof coverSchema>): JSX.Element {
  const spoken = lines.map((line) => line.replace(KEY_MARK, KEYHOLE_LETTER));
  const label = `${spoken.join(" ")} ${lead} ${audience}`;
  return (
    <section className="tf-cover" aria-label={label}>
      <div className="tf-stage">
        <div className="tf-room" data-tf-stage="">
          <div className="tf-cover__words">
            <h1 className="tf-headline" aria-label={label}>
              {lines.map((line) => (
                <HeadlineLine key={line} line={line} />
              ))}
            </h1>
            <p className="tf-cover__audience tf-fadeout" aria-hidden="true">
              <span className="tf-paren">(</span>
              <span className="tf-cover__lead">{lead}</span> <em>{audience}</em>
              <span className="tf-paren">)</span>
            </p>
          </div>
          <p className="tf-cover__cue tf-fadeout" aria-hidden="true">
            <span className="tf-bob">↓</span>
          </p>
          <div
            className="tf-curtain tf-curtain--left tf-cur-l"
            aria-hidden="true"
          />
          <div
            className="tf-curtain tf-curtain--right tf-cur-r"
            aria-hidden="true"
          />
          <Valance />
        </div>
      </div>
    </section>
  );
}

export const cover: SectionDefinition = defineSection(
  coverSchema,
  CoverSection,
  {
    title: "Cover",
    description:
      "The title scene: the headline's lines (each line's first letter becomes the red initial; [key] marks where the keyhole stands in for a letter), and the audience line, its lead and the audience in italics.",
  },
);

export const coverContent: JsonObject = {
  lines: ["Unlocking", "Market[key]ng", "Secrets"],
  lead: "for the",
  audience: "Innovators, Creatives & Pioneers",
} satisfies z.input<typeof coverSchema>;
