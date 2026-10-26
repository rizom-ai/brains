import type { CSSProperties, JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";

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
  viewBox: string;
  drawing: JSX.Element;
}

const INK = "currentColor";
const BRASS = "var(--palette-mustard)";

/** The seven keys, placed around the keyhole as the design scatters them. */
const KEYS: Key[] = [
  {
    x: "-24vw",
    y: "-27vh",
    r: "-20deg",
    wideOnly: false,
    viewBox: "0 0 220 90",
    drawing: (
      <>
        <circle
          cx="28"
          cy="45"
          r="16"
          fill="none"
          stroke={INK}
          strokeWidth="9"
        />
        <circle
          cx="48"
          cy="25"
          r="13"
          fill="none"
          stroke={INK}
          strokeWidth="8"
        />
        <circle
          cx="48"
          cy="65"
          r="13"
          fill="none"
          stroke={INK}
          strokeWidth="8"
        />
        <rect x="56" y="39" width="150" height="12" rx="3" fill={INK} />
        <path d="M170 51 h12 v18 h8 v-18 h12 v26 h-32 Z" fill={INK} />
      </>
    ),
  },
  {
    x: "-5vw",
    y: "-31vh",
    r: "68deg",
    wideOnly: false,
    viewBox: "0 0 220 84",
    drawing: (
      <>
        <circle
          cx="34"
          cy="42"
          r="24"
          fill="none"
          stroke={INK}
          strokeWidth="12"
        />
        <rect x="56" y="36" width="150" height="12" rx="3" fill={INK} />
        <rect x="170" y="48" width="12" height="20" fill={INK} />
        <rect x="192" y="48" width="10" height="14" fill={INK} />
      </>
    ),
  },
  {
    x: "22vw",
    y: "-25vh",
    r: "14deg",
    wideOnly: false,
    viewBox: "0 0 220 90",
    drawing: (
      <>
        <path
          fillRule="evenodd"
          d="M10 45 C10 18 26 8 52 8 H70 C84 8 92 20 92 32 V58 C92 70 84 82 70 82 H52 C26 82 10 72 10 45 Z M38 45 a10 10 0 1 0 0.1 0 Z"
          fill={INK}
        />
        <path
          d="M92 34 H206 L214 45 L206 52 L196 52 L190 60 L182 52 L172 60 L164 52 L154 60 L146 52 L136 60 L128 52 L92 52 Z"
          fill={INK}
        />
      </>
    ),
  },
  {
    x: "-27vw",
    y: "13vh",
    r: "58deg",
    wideOnly: true,
    viewBox: "0 0 220 90",
    drawing: (
      <>
        <path
          d="M12 20 L24 40 L38 14 L52 40 L64 20 L60 62 L16 62 Z"
          fill={BRASS}
        />
        <circle cx="38" cy="50" r="6" fill={INK} />
        <rect x="60" y="38" width="146" height="12" rx="3" fill={BRASS} />
        <rect x="176" y="50" width="10" height="18" fill={BRASS} />
        <rect x="194" y="50" width="10" height="12" fill={BRASS} />
      </>
    ),
  },
  {
    x: "27vw",
    y: "12vh",
    r: "-34deg",
    wideOnly: true,
    viewBox: "0 0 220 90",
    drawing: (
      <>
        <path
          fillRule="evenodd"
          d="M40 78 C10 58 4 40 10 26 C16 12 34 10 40 24 C46 10 64 12 70 26 C76 40 70 58 40 78 Z M40 36 a8 8 0 1 0 0.1 0 Z"
          fill={INK}
        />
        <rect x="66" y="38" width="140" height="12" rx="3" fill={INK} />
        <path d="M168 50 h10 v14 h8 v-14 h10 v24 h-28 Z" fill={INK} />
      </>
    ),
  },
  {
    x: "-15vw",
    y: "32vh",
    r: "-40deg",
    wideOnly: false,
    viewBox: "0 0 220 90",
    drawing: (
      <>
        <ellipse
          cx="34"
          cy="45"
          rx="26"
          ry="34"
          fill="none"
          stroke={INK}
          strokeWidth="10"
        />
        <rect x="58" y="39" width="150" height="12" rx="3" fill={INK} />
        <path
          d="M160 51 h10 v12 h8 v-12 h10 v20 h8 v-20 h10 v26 h-46 Z"
          fill={INK}
        />
      </>
    ),
  },
  {
    x: "13vw",
    y: "33vh",
    r: "25deg",
    wideOnly: false,
    viewBox: "0 0 220 90",
    drawing: (
      <>
        <path
          fillRule="evenodd"
          d="M44 6 a39 39 0 1 1 0 78 a39 39 0 1 1 0 -78 Z M30 45 a9 9 0 1 0 0.1 0 Z"
          fill={INK}
        />
        <path
          d="M80 36 H206 V54 H196 L190 46 L184 54 L176 46 L170 54 L162 46 L156 54 L80 54 Z"
          fill={INK}
        />
      </>
    ),
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
              <svg viewBox={key.viewBox} aria-hidden="true">
                {key.drawing}
              </svg>
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
