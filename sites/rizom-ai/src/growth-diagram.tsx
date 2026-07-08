import type { JSX } from "preact";

/* You → Team → Network drawn as one organism — the rev-5 product
   centerpiece (replaces Rover/Relay/Ranger as separate products).
   Geometry is verbatim from docs/rizom-site-mockups.html; colors and
   draw-in/bloom animation come from theme-rizom-ai's .growth classes.
   The wrapper's `reveal` class lets boot.js trigger the sequence. */
export function GrowthDiagram(): JSX.Element {
  return (
    <div className="growth reveal reveal-delay-1 mt-5 max-w-[1020px]">
      <svg
        viewBox="0 0 980 290"
        role="img"
        aria-label="One brain growing into a team, then a network"
      >
        <defs>
          <radialGradient id="zw-you" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#d4af37" stop-opacity=".1" />
            <stop offset="100%" stop-color="#d4af37" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="zw-team" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#e07a6a" stop-opacity=".08" />
            <stop offset="100%" stop-color="#e07a6a" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="zw-net" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#9caf88" stop-opacity=".08" />
            <stop offset="100%" stop-color="#9caf88" stop-opacity="0" />
          </radialGradient>
        </defs>

        {/* zone atmospheres */}
        <ellipse cx="110" cy="130" rx="110" ry="95" fill="url(#zw-you)" />
        <ellipse cx="440" cy="128" rx="160" ry="110" fill="url(#zw-team)" />
        <ellipse cx="790" cy="125" rx="190" ry="120" fill="url(#zw-net)" />

        {/* rootlet arriving from off-canvas left: you came from somewhere too */}
        <path
          className="fil hair draw"
          pathLength={1}
          style="--d:0s"
          d="M-20,150 C20,146 60,140 96,134"
        />

        {/* YOU: the origin */}
        <circle className="gn you" cx="110" cy="130" r="10" style="--d:.1s" />

        {/* three branches leave You and BECOME the team */}
        <path
          className="fil draw"
          pathLength={1}
          style="--d:.25s"
          d="M121,125 C190,102 260,92 336,96 C360,97 380,99 398,103"
        />
        <path
          className="fil draw"
          pathLength={1}
          style="--d:.35s"
          d="M122,133 C200,140 280,146 356,152 C372,153 384,156 396,160"
        />
        <path
          className="fil fine draw"
          pathLength={1}
          style="--d:.45s"
          d="M118,140 C170,175 240,196 320,196 C350,196 380,190 404,180"
        />

        {/* TEAM: a cluster with an internal web */}
        <circle className="gn seed" cx="408" cy="104" r="7" style="--d:.55s" />
        <circle className="gn peer" cx="472" cy="80" r="6" style="--d:.65s" />
        <circle
          className="gn peer"
          cx="506"
          cy="132"
          r="6.5"
          style="--d:.72s"
        />
        <circle className="gn peer" cx="462" cy="182" r="6" style="--d:.8s" />
        <circle
          className="gn peer"
          cx="402"
          cy="163"
          r="5.5"
          style="--d:.87s"
        />
        <path
          className="fil fine w-team draw"
          pathLength={1}
          style="--d:.7s"
          d="M414,100 C436,90 452,84 466,81"
        />
        <path
          className="fil fine w-team draw"
          pathLength={1}
          style="--d:.76s"
          d="M477,85 C490,99 498,114 503,126"
        />
        <path
          className="fil fine w-team draw"
          pathLength={1}
          style="--d:.82s"
          d="M503,138 C492,155 478,170 468,177"
        />
        <path
          className="fil fine w-team draw"
          pathLength={1}
          style="--d:.88s"
          d="M456,181 C438,177 420,171 408,166"
        />
        <path
          className="fil fine w-team draw"
          pathLength={1}
          style="--d:.94s"
          d="M404,158 C405,141 406,122 407,111"
        />
        <path
          className="fil hair w-team draw"
          pathLength={1}
          style="--d:1s"
          d="M413,109 C443,132 470,152 460,177 M470,86 C450,118 430,146 407,160"
        />

        {/* the team's outer threads BECOME the network */}
        <path
          className="fil draw"
          pathLength={1}
          style="--d:1.05s"
          d="M512,128 C570,116 630,104 688,96 C700,94 710,93 720,92"
        />
        <path
          className="fil fine draw"
          pathLength={1}
          style="--d:1.15s"
          d="M478,76 C540,58 610,50 672,56 C690,58 706,62 718,66"
        />
        <path
          className="fil fine draw"
          pathLength={1}
          style="--d:1.25s"
          d="M468,186 C530,196 600,198 660,188 C680,184 700,178 716,172"
        />

        {/* NETWORK: constellation, still growing */}
        <circle className="gn seed" cx="726" cy="90" r="6" style="--d:1.35s" />
        <circle
          className="gn peer"
          cx="782"
          cy="56"
          r="5.5"
          style="--d:1.42s"
        />
        <circle className="gn peer" cx="838" cy="92" r="6" style="--d:1.5s" />
        <circle
          className="gn peer"
          cx="864"
          cy="150"
          r="5.5"
          style="--d:1.58s"
        />
        <circle className="gn peer" cx="796" cy="180" r="5" style="--d:1.65s" />
        <circle className="gn peer" cx="726" cy="166" r="5" style="--d:1.72s" />
        <path
          className="fil fine w-net draw"
          pathLength={1}
          style="--d:1.45s"
          d="M731,86 C749,74 764,64 776,59"
        />
        <path
          className="fil fine w-net draw"
          pathLength={1}
          style="--d:1.52s"
          d="M788,59 C806,68 822,79 832,87"
        />
        <path
          className="fil fine w-net draw"
          pathLength={1}
          style="--d:1.6s"
          d="M841,98 C851,114 858,132 862,144"
        />
        <path
          className="fil fine w-net draw"
          pathLength={1}
          style="--d:1.67s"
          d="M858,155 C840,166 820,175 803,178"
        />
        <path
          className="fil fine w-net draw"
          pathLength={1}
          style="--d:1.74s"
          d="M790,180 C768,177 746,172 732,169"
        />
        <path
          className="fil hair w-net draw"
          pathLength={1}
          style="--d:1.8s"
          d="M727,161 C727,141 727,116 727,97 M733,93 C766,120 800,146 858,152 M780,62 C788,100 794,140 795,173"
        />

        {/* future nodes: dotted, not yet joined */}
        <circle className="gn faint" cx="912" cy="66" r="5" style="--d:1.9s" />
        <circle className="gn faint" cx="936" cy="140" r="4.5" style="--d:2s" />
        <circle className="gn faint" cx="886" cy="205" r="4" style="--d:2.1s" />
        <path
          className="fil hair draw"
          pathLength={1}
          style="--d:1.95s"
          d="M843,88 C868,79 888,72 906,68"
        />
        <path
          className="fil hair draw"
          pathLength={1}
          style="--d:2.05s"
          d="M869,146 C892,144 912,142 930,140"
        />
        <path
          className="fil hair draw"
          pathLength={1}
          style="--d:2.15s"
          d="M801,184 C830,193 856,200 880,204"
        />

        {/* growth continues past the frame */}
        <path
          className="fil hair draw"
          pathLength={1}
          style="--d:2.2s"
          d="M917,64 C940,60 960,58 990,56"
        />
        <path
          className="fil hair draw"
          pathLength={1}
          style="--d:2.3s"
          d="M941,141 C958,141 972,140 995,139"
        />

        {/* labels along a common baseline */}
        <line className="tick" x1="110" y1="238" x2="110" y2="248" />
        <text
          className="gt-you"
          x="110"
          y="264"
          text-anchor="middle"
          style="--d:.4s"
        >
          You
        </text>
        <text
          className="gt-sub"
          x="110"
          y="281"
          text-anchor="middle"
          style="--d:.5s"
        >
          personal brain · available now
        </text>
        <line className="tick" x1="452" y1="238" x2="452" y2="248" />
        <text
          className="gt-team"
          x="452"
          y="264"
          text-anchor="middle"
          style="--d:1s"
        >
          Team
        </text>
        <text
          className="gt-sub"
          x="452"
          y="281"
          text-anchor="middle"
          style="--d:1.1s"
        >
          shared intelligence · the team bundle
        </text>
        <line className="tick" x1="795" y1="238" x2="795" y2="248" />
        <text
          className="gt-net"
          x="795"
          y="264"
          text-anchor="middle"
          style="--d:1.7s"
        >
          Network
        </text>
        <text
          className="gt-sub"
          x="795"
          y="281"
          text-anchor="middle"
          style="--d:1.8s"
        >
          distributed expertise · emerging
        </text>
      </svg>
    </div>
  );
}
