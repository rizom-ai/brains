import type { JSX, ReactNode } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { ActHeading } from "./act-heading";
import { ButtonLink } from "./links";

/**
 * Your turn, the crossroads: a dark stage, a soft glow and one signpost hung
 * with swaying signs. "Which way?" leads to the brand test once the test
 * has a link; until then the test's lines stay off the page.
 */
const crossroadsSchema = z.object({
  act: z.string(),
  label: z.string(),
  opening: z.string(),
  headline: z.string(),
  emphasis: z.string(),
  test: z.object({
    text: z.string(),
    label: z.string(),
    href: z.string().default(""),
  }),
  signs: z.object({
    thisWay: z.string(),
    stop: z.string(),
    selling: z.string(),
    startTelling: z.string(),
    thatWay: z.string(),
    warning: z.string(),
    ahead: z.string(),
    yourWay: z.string(),
  }),
});

type Signs = z.infer<typeof crossroadsSchema>["signs"];

const PAPER = "var(--palette-paper)";
const INK = "var(--palette-ink)";
const SIGN_FONT = "Inter Tight, Arial, sans-serif";

/** One sign on the pole, swaying about where it hangs. */
function Sign({
  origin,
  delay,
  children,
}: {
  origin: string;
  delay: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <g
      className="tf-sign-sway"
      style={{ transformOrigin: origin, animationDelay: delay }}
    >
      {children}
    </g>
  );
}

function SignText({
  x,
  y,
  size,
  fill,
  spacing,
  children,
}: {
  x: number;
  y: number;
  size: number;
  fill: string;
  spacing?: number;
  children: string;
}): JSX.Element {
  return (
    <text
      x={x}
      y={y}
      fontFamily={SIGN_FONT}
      fontWeight="800"
      fontSize={size}
      textAnchor="middle"
      fill={fill}
      letterSpacing={spacing}
    >
      {children}
    </text>
  );
}

/**
 * The signpost: one pole hung with advice — this way, stop selling and
 * start telling, that way, an eye on the lookout, jargon ahead, your way.
 */
function Signpost({ signs }: { signs: Signs }): JSX.Element {
  return (
    <svg className="tf-signpost" viewBox="0 0 360 650" aria-hidden="true">
      <rect
        x="171"
        y="24"
        width="18"
        height="626"
        fill={PAPER}
        stroke={INK}
        strokeWidth="3"
      />
      <rect
        x="166"
        y="40"
        width="28"
        height="9"
        rx="2"
        fill={PAPER}
        stroke={INK}
        strokeWidth="3"
      />
      <path
        d="M171 24 Q180 4 189 24 Z"
        fill={PAPER}
        stroke={INK}
        strokeWidth="3"
      />
      <Sign origin="180px 105px" delay="-1s">
        <rect x="184" y="78" width="166" height="54" rx="6" fill={INK} />
        <path d="M196 92 H306 V84 L338 105 L306 126 V118 H196 Z" fill={PAPER} />
        <SignText x={251} y={111} size={17} fill={INK} spacing={0.5}>
          {signs.thisWay}
        </SignText>
      </Sign>
      <Sign origin="175px 190px" delay="-3s">
        <polygon
          points="81,122 139,122 180,163 180,221 139,262 81,262 40,221 40,163"
          fill="var(--palette-red)"
          stroke={INK}
          strokeWidth="4"
        />
        <polygon
          points="85,132 135,132 170,167 170,217 135,252 85,252 50,217 50,167"
          fill="none"
          stroke={PAPER}
          strokeWidth="3"
        />
        <SignText x={110} y={186} size={34} fill={PAPER}>
          {signs.stop}
        </SignText>
        <SignText x={110} y={208} size={15} fill={PAPER} spacing={1}>
          {signs.selling}
        </SignText>
        <g transform="rotate(-8 112 232)">
          <rect x="56" y="218" width="114" height="28" fill={INK} />
          <SignText
            x={113}
            y={238}
            size={14}
            fill="var(--palette-mustard)"
            spacing={0.5}
          >
            {signs.startTelling}
          </SignText>
        </g>
      </Sign>
      <Sign origin="180px 300px" delay="-5s">
        <g transform="rotate(-9 175 300)">
          <rect
            x="52"
            y="274"
            width="250"
            height="56"
            rx="6"
            fill="var(--palette-mint)"
            stroke={INK}
            strokeWidth="3"
          />
          <path
            d="M286 290 H110 V281 L70 302 L110 323 V314 H286 Z"
            fill={INK}
          />
          <SignText
            x={196}
            y={309}
            size={17}
            fill="var(--palette-mint)"
            spacing={0.5}
          >
            {signs.thatWay}
          </SignText>
        </g>
      </Sign>
      <Sign origin="189px 405px" delay="-2s">
        <rect x="186" y="398" width="30" height="12" fill={INK} />
        <circle
          cx="268"
          cy="404"
          r="60"
          fill="var(--palette-mustard)"
          stroke={INK}
          strokeWidth="4"
        />
        <g className="tf-blink tf-sign-eye">
          <path
            d="M222 404 Q268 366 314 404 Q268 442 222 404 Z"
            fill={PAPER}
            stroke={INK}
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <circle cx="268" cy="404" r="16" fill={INK} />
          <circle cx="274" cy="398" r="5" fill={PAPER} />
        </g>
      </Sign>
      <Sign origin="172px 470px" delay="-4s">
        <rect x="150" y="466" width="22" height="10" fill={INK} />
        <path
          d="M104 444 L172 562 L36 562 Z"
          fill={PAPER}
          stroke="var(--palette-red)"
          strokeWidth="10"
          strokeLinejoin="round"
        />
        <SignText x={104} y={508} size={26} fill={INK}>
          !
        </SignText>
        <SignText x={104} y={530} size={13} fill={INK} spacing={0.5}>
          {signs.warning}
        </SignText>
        <SignText x={104} y={547} size={13} fill={INK} spacing={0.5}>
          {signs.ahead}
        </SignText>
      </Sign>
      <Sign origin="180px 600px" delay="-6s">
        <rect
          x="92"
          y="584"
          width="176"
          height="46"
          rx="10"
          fill={PAPER}
          stroke={INK}
          strokeWidth="3"
        />
        <rect
          x="100"
          y="592"
          width="160"
          height="30"
          rx="6"
          fill="none"
          stroke={INK}
          strokeWidth="1.5"
        />
        <SignText x={180} y={613} size={16} fill={INK} spacing={1}>
          {signs.yourWay}
        </SignText>
      </Sign>
    </svg>
  );
}

function CrossroadsSection({
  act,
  label,
  opening,
  headline,
  emphasis,
  test,
  signs,
}: z.infer<typeof crossroadsSchema>): JSX.Element {
  return (
    <section className="tf-act tf-act--crossroads">
      <div className="tf-wrap tf-crossroads">
        <div className="tf-crossroads__words">
          <ActHeading
            act={act}
            label={label}
            opening={opening}
            light="mustard"
          />
          <h2 className="tf-crossroads__headline tf-reveal">
            {headline} <em>{emphasis}</em>
          </h2>
          {test.href && (
            <>
              <p className="tf-lede">{test.text}</p>
              <div>
                <ButtonLink
                  link={{ label: test.label, href: test.href }}
                  tone="mustard"
                />
              </div>
            </>
          )}
        </div>
        <div className="tf-crossroads__scene" aria-hidden="true">
          <div className="tf-glow-disc" />
          <Signpost signs={signs} />
        </div>
      </div>
    </section>
  );
}

export const crossroads: SectionDefinition = defineSection(
  crossroadsSchema,
  CrossroadsSection,
  {
    title: "Your turn — The crossroads",
    description:
      "The crossroads: the act's words, the headline and its emphasis, the brand test, shown once it has a link, and the words on the signpost's signs.",
  },
);

export const crossroadsContent: JsonObject = {
  act: "Your turn",
  label: "The crossroads",
  opening: "Now you’re standing at a crossroads.",
  headline: "Which",
  emphasis: "way?",
  test: {
    text: "Find out what kind of brand you are in three minutes. Results may be uncomfortably accurate.",
    label: "Take the test →",
    href: "",
  },
  signs: {
    thisWay: "THIS WAY",
    stop: "STOP",
    selling: "SELLING",
    startTelling: "START TELLING",
    thatWay: "THAT WAY",
    warning: "JARGON",
    ahead: "AHEAD",
    yourWay: "YOUR WAY →",
  },
} satisfies z.input<typeof crossroadsSchema>;
