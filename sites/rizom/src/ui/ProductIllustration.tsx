import type { JSX } from "preact";
import type { ProductVariant } from "./types";

const PRODUCT_SVGS: Record<ProductVariant, string> = {
  rover: `<svg class="product-diagram" viewBox="0 0 511 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" aria-label="An abstract amber cloud of captured thoughts flows into a central voiceprint signature, which is stamped on three identical output carriers. Same voice, carried through every output.">
        <defs>
          <filter id="rover-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <radialGradient id="rover-cloud-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stop-color="var(--palette-amber)" stop-opacity="0.18"/>
            <stop offset="55%" stop-color="var(--palette-amber)" stop-opacity="0.05"/>
            <stop offset="100%" stop-color="var(--palette-amber)" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="rover-voice-aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stop-color="var(--palette-amber-glow)" stop-opacity="0.28"/>
            <stop offset="45%"  stop-color="var(--palette-amber)"       stop-opacity="0.1"/>
            <stop offset="100%" stop-color="var(--palette-amber)"       stop-opacity="0"/>
          </radialGradient>
        </defs>

        <!-- Crosshairs at the four corners of the diagram -->
        <g class="crosshair" stroke="var(--palette-amber)">
          <line x1="6" y1="6" x2="18" y2="6"/><line x1="6" y1="6" x2="6" y2="18"/>
          <line x1="505" y1="6" x2="493" y2="6"/><line x1="505" y1="6" x2="505" y2="18"/>
          <line x1="6" y1="314" x2="18" y2="314"/><line x1="6" y1="314" x2="6" y2="302"/>
          <line x1="505" y1="314" x2="493" y2="314"/><line x1="505" y1="314" x2="505" y2="302"/>
        </g>

        <!-- A. RAW CAPTURES — abstract amber particle cloud. No figurative
             note/link/card shapes. Just a dense organic scatter of thought
             particles, varying size and opacity, threaded through with
             organic wisp curves. -->
        <ellipse cx="92" cy="165" rx="105" ry="130" fill="url(#rover-cloud-glow)"/>

        <g fill="var(--palette-amber)">
          <!-- bright anchors -->
          <circle cx="30"  cy="55"  r="1.8" opacity="0.85"/>
          <circle cx="110" cy="72"  r="2.2" opacity="0.92"/>
          <circle cx="48"  cy="115" r="1.8" opacity="0.8"/>
          <circle cx="96"  cy="140" r="2.1" opacity="0.9"/>
          <circle cx="140" cy="125" r="1.9" opacity="0.85"/>
          <circle cx="68"  cy="175" r="2.0" opacity="0.9"/>
          <circle cx="116" cy="192" r="1.9" opacity="0.85"/>
          <circle cx="58"  cy="228" r="1.8" opacity="0.82"/>
          <circle cx="128" cy="240" r="2.1" opacity="0.9"/>
          <circle cx="82"  cy="270" r="1.8" opacity="0.8"/>

          <!-- mediums -->
          <circle cx="52"  cy="78"  r="1.4" opacity="0.6"/>
          <circle cx="72"  cy="62"  r="1.3" opacity="0.55"/>
          <circle cx="140" cy="88"  r="1.5" opacity="0.6"/>
          <circle cx="162" cy="110" r="1.3" opacity="0.55"/>
          <circle cx="24"  cy="138" r="1.4" opacity="0.5"/>
          <circle cx="78"  cy="108" r="1.5" opacity="0.6"/>
          <circle cx="118" cy="108" r="1.2" opacity="0.5"/>
          <circle cx="38"  cy="172" r="1.5" opacity="0.62"/>
          <circle cx="148" cy="168" r="1.3" opacity="0.55"/>
          <circle cx="155" cy="208" r="1.4" opacity="0.6"/>
          <circle cx="36"  cy="248" r="1.4" opacity="0.55"/>
          <circle cx="96"  cy="222" r="1.3" opacity="0.55"/>
          <circle cx="112" cy="262" r="1.5" opacity="0.6"/>
          <circle cx="148" cy="258" r="1.3" opacity="0.5"/>
          <circle cx="50"  cy="200" r="1.2" opacity="0.5"/>

          <!-- faint specks -->
          <circle cx="15"  cy="80"  r="0.7" opacity="0.25"/>
          <circle cx="88"  cy="38"  r="0.8" opacity="0.3"/>
          <circle cx="132" cy="50"  r="0.65" opacity="0.22"/>
          <circle cx="160" cy="70"  r="0.7" opacity="0.28"/>
          <circle cx="10"  cy="110" r="0.75" opacity="0.25"/>
          <circle cx="60"  cy="132" r="0.9" opacity="0.35"/>
          <circle cx="90"  cy="92"  r="0.7" opacity="0.3"/>
          <circle cx="164" cy="145" r="0.8" opacity="0.28"/>
          <circle cx="20"  cy="178" r="0.7" opacity="0.26"/>
          <circle cx="76"  cy="150" r="0.8" opacity="0.3"/>
          <circle cx="128" cy="156" r="0.7" opacity="0.28"/>
          <circle cx="168" cy="188" r="0.65" opacity="0.22"/>
          <circle cx="10"  cy="222" r="0.7" opacity="0.25"/>
          <circle cx="68"  cy="255" r="0.9" opacity="0.35"/>
          <circle cx="102" cy="245" r="0.7" opacity="0.3"/>
          <circle cx="20"  cy="290" r="0.75" opacity="0.28"/>
          <circle cx="168" cy="230" r="0.7" opacity="0.26"/>
          <circle cx="138" cy="282" r="0.8" opacity="0.3"/>
        </g>

        <!-- Sparks -->
        <g fill="var(--palette-amber-light)">
          <circle cx="124" cy="108" r="1.2" opacity="0.85"/>
          <circle cx="62"  cy="196" r="1.1" opacity="0.8"/>
          <circle cx="146" cy="218" r="1.0" opacity="0.78"/>
          <circle cx="90"  cy="248" r="1.1" opacity="0.82"/>
        </g>

        <!-- Organic wisp curves threading through the cloud — warmth. -->
        <g fill="none" stroke="var(--palette-amber)" stroke-linecap="round">
          <path d="M 22,92 Q 54,86 82,100 T 138,112" stroke-width="0.5" opacity="0.28"/>
          <path d="M 34,210 Q 70,222 102,212 T 162,228" stroke-width="0.5" opacity="0.25"/>
          <path d="M 68,60 Q 88,80 102,72"             stroke-width="0.4" opacity="0.2"/>
          <path d="M 50,268 Q 86,254 130,272"          stroke-width="0.4" opacity="0.2"/>
        </g>

        <!-- B. VOICEPRINT — the distilled signature. Warm radial aura
             instead of geometric rings. A few peak bars are hot
             (amber-light / amber-cream) — the waveform has loud moments. -->
        <g transform="translate(214,160)">
          <circle cx="56" cy="0" r="72" fill="url(#rover-voice-aura)"/>
          <line x1="-4" y1="0" x2="116" y2="0" stroke="var(--palette-amber)" stroke-width="0.6" opacity="0.3"/>
          <g fill="var(--palette-amber)" filter="url(#rover-glow)">
            <rect x="0"   y="-3"    width="2" height="6"  rx="1"/>
            <rect x="4"   y="-5"    width="2" height="10" rx="1"/>
            <rect x="8"   y="-8"    width="2" height="16" rx="1"/>
            <rect x="12"  y="-11"   width="2" height="22" rx="1"/>
            <rect x="16"  y="-14"   width="2" height="28" rx="1"/>
            <rect x="20"  y="-16"   width="2" height="32" rx="1" fill="var(--palette-amber-light)"/>
            <rect x="24"  y="-13"   width="2" height="26" rx="1"/>
            <rect x="28"  y="-9"    width="2" height="18" rx="1"/>
            <rect x="32"  y="-6"    width="2" height="12" rx="1"/>
            <rect x="36"  y="-4"    width="2" height="8"  rx="1"/>
            <rect x="40"  y="-7"    width="2" height="14" rx="1"/>
            <rect x="44"  y="-11"   width="2" height="22" rx="1"/>
            <rect x="48"  y="-15"   width="2" height="30" rx="1" fill="var(--palette-amber-light)"/>
            <rect x="52"  y="-17.5" width="2" height="35" rx="1" fill="var(--palette-amber-glow)"/>
            <rect x="56"  y="-16"   width="2" height="32" rx="1" fill="var(--palette-amber-light)"/>
            <rect x="60"  y="-12"   width="2" height="24" rx="1"/>
            <rect x="64"  y="-8"    width="2" height="16" rx="1"/>
            <rect x="68"  y="-6"    width="2" height="12" rx="1"/>
            <rect x="72"  y="-9"    width="2" height="18" rx="1"/>
            <rect x="76"  y="-13"   width="2" height="26" rx="1"/>
            <rect x="80"  y="-14"   width="2" height="28" rx="1" fill="var(--palette-amber-light)"/>
            <rect x="84"  y="-11"   width="2" height="22" rx="1"/>
            <rect x="88"  y="-8"    width="2" height="16" rx="1"/>
            <rect x="92"  y="-5"    width="2" height="10" rx="1"/>
            <rect x="96"  y="-4"    width="2" height="8"  rx="1"/>
            <rect x="100" y="-3"    width="2" height="6"  rx="1"/>
            <rect x="104" y="-2"    width="2" height="4"  rx="1"/>
            <rect x="108" y="-1.5"  width="2" height="3"  rx="1"/>
          </g>
        </g>

        <!-- C. CARRIERS — three identical signature carriers. No title
             lines, no slide thumbnail, no avatar. Each card holds only
             the voiceprint centered, with matching hot peak bars — the
             signature's hot points echo identically on every output. -->

        <!-- Carrier 1 (y=30-90) -->
        <g>
          <rect class="tile" x="362" y="30" width="128" height="60" rx="4"
                stroke="rgba(232,119,34,0.5)" stroke-width="1" fill="rgba(232,119,34,0.04)"/>
          <g transform="translate(376,60)" fill="var(--palette-amber)" opacity="0.9">
            <rect x="0"    y="-1.5" width="1.4" height="3"   rx="0.7"/>
            <rect x="4.3"  y="-2.5" width="1.4" height="5"   rx="0.7"/>
            <rect x="8.6"  y="-4"   width="1.4" height="8"   rx="0.7"/>
            <rect x="12.9" y="-5.5" width="1.4" height="11"  rx="0.7"/>
            <rect x="17.2" y="-7"   width="1.4" height="14"  rx="0.7"/>
            <rect x="21.5" y="-8"   width="1.4" height="16"  rx="0.7" fill="var(--palette-amber-light)"/>
            <rect x="25.8" y="-6.5" width="1.4" height="13"  rx="0.7"/>
            <rect x="30.1" y="-4.5" width="1.4" height="9"   rx="0.7"/>
            <rect x="34.4" y="-3"   width="1.4" height="6"   rx="0.7"/>
            <rect x="38.7" y="-2"   width="1.4" height="4"   rx="0.7"/>
            <rect x="43"   y="-3.5" width="1.4" height="7"   rx="0.7"/>
            <rect x="47.3" y="-5.5" width="1.4" height="11"  rx="0.7"/>
            <rect x="51.6" y="-7.5" width="1.4" height="15"  rx="0.7" fill="var(--palette-amber-light)"/>
            <rect x="55.9" y="-8.5" width="1.4" height="17"  rx="0.7" fill="var(--palette-amber-glow)"/>
            <rect x="60.2" y="-8"   width="1.4" height="16"  rx="0.7" fill="var(--palette-amber-light)"/>
            <rect x="64.5" y="-6"   width="1.4" height="12"  rx="0.7"/>
            <rect x="68.8" y="-4"   width="1.4" height="8"   rx="0.7"/>
            <rect x="73.1" y="-3"   width="1.4" height="6"   rx="0.7"/>
            <rect x="77.4" y="-4.5" width="1.4" height="9"   rx="0.7"/>
            <rect x="81.7" y="-6.5" width="1.4" height="13"  rx="0.7"/>
            <rect x="86"   y="-7"   width="1.4" height="14"  rx="0.7" fill="var(--palette-amber-light)"/>
            <rect x="90.3" y="-5.5" width="1.4" height="11"  rx="0.7"/>
            <rect x="94.6" y="-4"   width="1.4" height="8"   rx="0.7"/>
            <rect x="98.9" y="-2.5" width="1.4" height="5"   rx="0.7"/>
            <rect x="103.2" y="-1.5" width="1.4" height="3"  rx="0.7"/>
          </g>
        </g>

        <!-- Carrier 2 (y=130-190) -->
        <g>
          <rect class="tile" x="362" y="130" width="128" height="60" rx="4"
                stroke="rgba(232,119,34,0.5)" stroke-width="1" fill="rgba(232,119,34,0.04)"/>
          <g transform="translate(376,160)" fill="var(--palette-amber)" opacity="0.9">
            <rect x="0"    y="-1.5" width="1.4" height="3"   rx="0.7"/>
            <rect x="4.3"  y="-2.5" width="1.4" height="5"   rx="0.7"/>
            <rect x="8.6"  y="-4"   width="1.4" height="8"   rx="0.7"/>
            <rect x="12.9" y="-5.5" width="1.4" height="11"  rx="0.7"/>
            <rect x="17.2" y="-7"   width="1.4" height="14"  rx="0.7"/>
            <rect x="21.5" y="-8"   width="1.4" height="16"  rx="0.7" fill="var(--palette-amber-light)"/>
            <rect x="25.8" y="-6.5" width="1.4" height="13"  rx="0.7"/>
            <rect x="30.1" y="-4.5" width="1.4" height="9"   rx="0.7"/>
            <rect x="34.4" y="-3"   width="1.4" height="6"   rx="0.7"/>
            <rect x="38.7" y="-2"   width="1.4" height="4"   rx="0.7"/>
            <rect x="43"   y="-3.5" width="1.4" height="7"   rx="0.7"/>
            <rect x="47.3" y="-5.5" width="1.4" height="11"  rx="0.7"/>
            <rect x="51.6" y="-7.5" width="1.4" height="15"  rx="0.7" fill="var(--palette-amber-light)"/>
            <rect x="55.9" y="-8.5" width="1.4" height="17"  rx="0.7" fill="var(--palette-amber-glow)"/>
            <rect x="60.2" y="-8"   width="1.4" height="16"  rx="0.7" fill="var(--palette-amber-light)"/>
            <rect x="64.5" y="-6"   width="1.4" height="12"  rx="0.7"/>
            <rect x="68.8" y="-4"   width="1.4" height="8"   rx="0.7"/>
            <rect x="73.1" y="-3"   width="1.4" height="6"   rx="0.7"/>
            <rect x="77.4" y="-4.5" width="1.4" height="9"   rx="0.7"/>
            <rect x="81.7" y="-6.5" width="1.4" height="13"  rx="0.7"/>
            <rect x="86"   y="-7"   width="1.4" height="14"  rx="0.7" fill="var(--palette-amber-light)"/>
            <rect x="90.3" y="-5.5" width="1.4" height="11"  rx="0.7"/>
            <rect x="94.6" y="-4"   width="1.4" height="8"   rx="0.7"/>
            <rect x="98.9" y="-2.5" width="1.4" height="5"   rx="0.7"/>
            <rect x="103.2" y="-1.5" width="1.4" height="3"  rx="0.7"/>
          </g>
        </g>

        <!-- Carrier 3 (y=230-290) -->
        <g>
          <rect class="tile" x="362" y="230" width="128" height="60" rx="4"
                stroke="rgba(232,119,34,0.5)" stroke-width="1" fill="rgba(232,119,34,0.04)"/>
          <g transform="translate(376,260)" fill="var(--palette-amber)" opacity="0.9">
            <rect x="0"    y="-1.5" width="1.4" height="3"   rx="0.7"/>
            <rect x="4.3"  y="-2.5" width="1.4" height="5"   rx="0.7"/>
            <rect x="8.6"  y="-4"   width="1.4" height="8"   rx="0.7"/>
            <rect x="12.9" y="-5.5" width="1.4" height="11"  rx="0.7"/>
            <rect x="17.2" y="-7"   width="1.4" height="14"  rx="0.7"/>
            <rect x="21.5" y="-8"   width="1.4" height="16"  rx="0.7" fill="var(--palette-amber-light)"/>
            <rect x="25.8" y="-6.5" width="1.4" height="13"  rx="0.7"/>
            <rect x="30.1" y="-4.5" width="1.4" height="9"   rx="0.7"/>
            <rect x="34.4" y="-3"   width="1.4" height="6"   rx="0.7"/>
            <rect x="38.7" y="-2"   width="1.4" height="4"   rx="0.7"/>
            <rect x="43"   y="-3.5" width="1.4" height="7"   rx="0.7"/>
            <rect x="47.3" y="-5.5" width="1.4" height="11"  rx="0.7"/>
            <rect x="51.6" y="-7.5" width="1.4" height="15"  rx="0.7" fill="var(--palette-amber-light)"/>
            <rect x="55.9" y="-8.5" width="1.4" height="17"  rx="0.7" fill="var(--palette-amber-glow)"/>
            <rect x="60.2" y="-8"   width="1.4" height="16"  rx="0.7" fill="var(--palette-amber-light)"/>
            <rect x="64.5" y="-6"   width="1.4" height="12"  rx="0.7"/>
            <rect x="68.8" y="-4"   width="1.4" height="8"   rx="0.7"/>
            <rect x="73.1" y="-3"   width="1.4" height="6"   rx="0.7"/>
            <rect x="77.4" y="-4.5" width="1.4" height="9"   rx="0.7"/>
            <rect x="81.7" y="-6.5" width="1.4" height="13"  rx="0.7"/>
            <rect x="86"   y="-7"   width="1.4" height="14"  rx="0.7" fill="var(--palette-amber-light)"/>
            <rect x="90.3" y="-5.5" width="1.4" height="11"  rx="0.7"/>
            <rect x="94.6" y="-4"   width="1.4" height="8"   rx="0.7"/>
            <rect x="98.9" y="-2.5" width="1.4" height="5"   rx="0.7"/>
            <rect x="103.2" y="-1.5" width="1.4" height="3"  rx="0.7"/>
          </g>
        </g>
      </svg>`,
  relay: `<svg class="product-diagram" viewBox="0 0 511 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" aria-label="Five teammates as TMS-dimension pentagon radars spread across the canvas; each radar carries a voiceprint signature. Alex's radar is a ghost — his signature persists in the team record. The team has rewired its live connections around him (Iris↔Kai direct).">
        <defs>
          <filter id="relay-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <radialGradient id="relay-remnant-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stop-color="var(--palette-purple-light)" stop-opacity="0.4"/>
            <stop offset="60%" stop-color="var(--palette-purple-light)" stop-opacity="0.1"/>
            <stop offset="100%" stop-color="var(--palette-purple-light)" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="relay-maya-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stop-color="var(--palette-amber-light)" stop-opacity="0.26"/>
            <stop offset="55%" stop-color="var(--palette-amber)" stop-opacity="0.08"/>
            <stop offset="100%" stop-color="var(--palette-amber)" stop-opacity="0"/>
          </radialGradient>
        </defs>

        <!-- Corner crosshairs -->
        <g class="crosshair" stroke="var(--palette-purple-light)">
          <line x1="6" y1="6" x2="18" y2="6"/><line x1="6" y1="6" x2="6" y2="18"/>
          <line x1="505" y1="6" x2="493" y2="6"/><line x1="505" y1="6" x2="505" y2="18"/>
          <line x1="6" y1="314" x2="18" y2="314"/><line x1="6" y1="314" x2="6" y2="302"/>
          <line x1="505" y1="314" x2="493" y2="314"/><line x1="505" y1="314" x2="505" y2="302"/>
        </g>

        <!-- TMS PENTAGON RADARS — five teammates as 5-dimensional
             radars (Specialization · Credibility · cOordination · Memory
             · Transfer). Each radar's data polygon is that teammate's
             specific TMS profile, plus a voiceprint signature below.
             Alex's radar is a ghost (dashed outline, outline-only data
             polygon); his TMS signature persists in the team record
             even though the team has rewired its live connections
             around him (Iris↔Kai direct). -->

        <!-- Subtle coordinate curves -->
        <g stroke="var(--palette-purple-light)" stroke-width="0.4" fill="none" opacity="0.08" stroke-dasharray="1 4">
          <path d="M 0,85 Q 255,105 510,75"/>
          <path d="M 0,240 Q 255,260 510,230"/>
          <path d="M 100,0 Q 120,160 90,320"/>
          <path d="M 430,0 Q 415,160 430,320"/>
        </g>

        <!-- Background starfield -->
        <g fill="var(--palette-purple-light)">
          <circle cx="40"  cy="48"  r="0.9" opacity="0.3"/>
          <circle cx="148" cy="32"  r="0.9" opacity="0.3"/>
          <circle cx="310" cy="30"  r="0.85" opacity="0.28"/>
          <circle cx="372" cy="22"  r="0.9" opacity="0.3"/>
          <circle cx="486" cy="56"  r="0.85" opacity="0.25"/>
          <circle cx="24"  cy="176" r="0.9" opacity="0.28"/>
          <circle cx="58"  cy="280" r="0.9" opacity="0.26"/>
          <circle cx="262" cy="298" r="0.85" opacity="0.24"/>
          <circle cx="342" cy="300" r="0.85" opacity="0.26"/>
          <circle cx="498" cy="180" r="0.9" opacity="0.28"/>
          <circle cx="78"  cy="22"  r="0.55" opacity="0.2"/>
          <circle cx="198" cy="20"  r="0.5" opacity="0.2"/>
          <circle cx="312" cy="168" r="0.55" opacity="0.22"/>
          <circle cx="98"  cy="240" r="0.5" opacity="0.2"/>
          <circle cx="268" cy="200" r="0.55" opacity="0.2"/>
          <circle cx="362" cy="205" r="0.5" opacity="0.2"/>
          <circle cx="254" cy="140" r="0.55" opacity="0.22"/>
          <circle cx="28"  cy="118" r="0.5" opacity="0.2"/>
          <circle cx="502" cy="302" r="0.55" opacity="0.22"/>
          <circle cx="388" cy="160" r="0.5" opacity="0.18"/>
          <circle cx="100" cy="298" r="0.55" opacity="0.2"/>
          <circle cx="460" cy="20"  r="0.55" opacity="0.22"/>
        </g>

        <!-- Remnant nebula around departed Alex (425, 255) -->
        <circle cx="425" cy="255" r="72" fill="url(#relay-remnant-glow)"/>
        <circle cx="425" cy="255" r="58" fill="none" stroke="var(--palette-purple-light)" stroke-width="0.5" opacity="0.22" stroke-dasharray="1 3"/>
        <circle cx="425" cy="255" r="44" fill="none" stroke="var(--palette-purple-light)" stroke-width="0.4" opacity="0.28" stroke-dasharray="1 2"/>
        <g fill="var(--palette-purple-light)">
          <circle cx="492" cy="204" r="0.7" opacity="0.35"/>
          <circle cx="502" cy="182" r="0.55" opacity="0.25"/>
          <circle cx="460" cy="310" r="0.7" opacity="0.35"/>
          <circle cx="490" cy="298" r="0.55" opacity="0.25"/>
          <circle cx="368" cy="306" r="0.55" opacity="0.25"/>
        </g>

        <!-- Constellation edges — 5 live among Maya/Sam/Kai/Iris.
             Alex disconnected (team rewired around him). -->
        <g fill="none" stroke="var(--palette-purple-light)" stroke-width="0.95" opacity="0.55" stroke-linecap="round">
          <line x1="100" y1="130" x2="255" y2="65"/>
          <line x1="255" y1="65"  x2="440" y2="100"/>
          <line x1="100" y1="130" x2="165" y2="245"/>
          <line x1="255" y1="65"  x2="165" y2="245"/>
          <line x1="165" y1="245" x2="440" y2="100"/>
        </g>
        <g fill="var(--palette-purple-light)" opacity="0.75">
          <circle cx="177.5" cy="97.5"  r="1"/>
          <circle cx="347.5" cy="82.5"  r="1"/>
          <circle cx="132.5" cy="187.5" r="1"/>
          <circle cx="210"   cy="155"   r="1"/>
          <circle cx="302.5" cy="172.5" r="1"/>
        </g>

        <!-- MAYA · (100, 130) r=42 · lead · S=0.95 C=0.90 O=0.82 M=0.88 T=0.85 -->
        <g transform="translate(100 130)">
          <circle r="54" fill="url(#relay-maya-halo)"/>
          <circle r="48" fill="none" stroke="var(--palette-amber)" stroke-width="0.4" opacity="0.18"/>
          <path d="M 0,-42 L 39.94,-12.98 L 24.70,33.98 L -24.70,33.98 L -39.94,-12.98 Z"
                fill="none" stroke="var(--palette-amber-light)" stroke-width="0.8" opacity="0.5"/>
          <path d="M 0,-28 L 26.63,-8.65 L 16.46,22.65 L -16.46,22.65 L -26.63,-8.65 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.4" opacity="0.28" stroke-dasharray="2 3"/>
          <path d="M 0,-14 L 13.31,-4.33 L 8.23,11.33 L -8.23,11.33 L -13.31,-4.33 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.4" opacity="0.22" stroke-dasharray="1 2"/>
          <g stroke="var(--palette-purple-light)" stroke-width="0.6" opacity="0.45">
            <line x1="0" y1="0" x2="0"      y2="-42"/>
            <line x1="0" y1="0" x2="39.94"  y2="-12.98"/>
            <line x1="0" y1="0" x2="24.70"  y2="33.98"/>
            <line x1="0" y1="0" x2="-24.70" y2="33.98"/>
            <line x1="0" y1="0" x2="-39.94" y2="-12.98"/>
          </g>
          <path d="M 0,-39.9 L 35.95,-11.68 L 20.25,27.86 L -21.73,29.9 L -33.95,-11.03 Z"
                fill="rgba(255,163,102,0.2)" stroke="var(--palette-amber-light)" stroke-width="1.2" opacity="0.98"/>
          <g>
            <circle cx="0"      cy="-39.9"  r="1.8" fill="var(--palette-amber-light)"/>
            <circle cx="35.95"  cy="-11.68" r="1.8" fill="var(--palette-amber-light)"/>
            <circle cx="20.25"  cy="27.86"  r="1.8" fill="var(--palette-amber-light)"/>
            <circle cx="-21.73" cy="29.9"   r="1.8" fill="var(--palette-amber-light)"/>
            <circle cx="-33.95" cy="-11.03" r="1.8" fill="var(--palette-amber-light)"/>
          </g>
          <circle r="4.5" fill="var(--palette-amber)" filter="url(#relay-glow)"/>
          <g stroke="var(--palette-amber)" stroke-width="0.7" opacity="0.7">
            <line x1="-8"  y1="-8"  x2="-12" y2="-12"/>
            <line x1="8"   y1="-8"  x2="12"  y2="-12"/>
            <line x1="8"   y1="8"   x2="12"  y2="12"/>
            <line x1="-8"  y1="8"   x2="-12" y2="12"/>
          </g>
          <g fill="var(--palette-amber-light)" opacity="0.95">
            <rect x="-8.9" y="42.2"  width="1.8" height="7.6"  rx="0.6"/>
            <rect x="-4.9" y="42.4"  width="1.8" height="7.2"  rx="0.6"/>
            <rect x="-0.9" y="42.72" width="1.8" height="6.56" rx="0.6"/>
            <rect x="3.1"  y="42.48" width="1.8" height="7.04" rx="0.6"/>
            <rect x="7.1"  y="42.6"  width="1.8" height="6.8"  rx="0.6"/>
          </g>
        </g>

        <!-- SAM · (255, 65) r=38 · coordinator · S=0.60 C=0.72 O=0.95 M=0.50 T=0.75 -->
        <g transform="translate(255 65)">
          <path d="M 0,-38 L 36.14,-11.74 L 22.34,30.74 L -22.34,30.74 L -36.14,-11.74 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.8" opacity="0.45"/>
          <path d="M 0,-25 L 23.78,-7.73 L 14.70,20.23 L -14.70,20.23 L -23.78,-7.73 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.4" opacity="0.25" stroke-dasharray="2 3"/>
          <path d="M 0,-13 L 12.36,-4.02 L 7.64,10.52 L -7.64,10.52 L -12.36,-4.02 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.4" opacity="0.22" stroke-dasharray="1 2"/>
          <g stroke="var(--palette-purple-light)" stroke-width="0.55" opacity="0.35">
            <line x1="0" y1="0" x2="0"      y2="-38"/>
            <line x1="0" y1="0" x2="36.14"  y2="-11.74"/>
            <line x1="0" y1="0" x2="22.34"  y2="30.74"/>
            <line x1="0" y1="0" x2="-22.34" y2="30.74"/>
            <line x1="0" y1="0" x2="-36.14" y2="-11.74"/>
          </g>
          <path d="M 0,-22.8 L 26.02,-8.45 L 21.23,29.21 L -11.17,15.37 L -27.10,-8.81 Z"
                fill="rgba(140,130,200,0.22)" stroke="var(--palette-purple-light)" stroke-width="1" opacity="0.92"/>
          <g>
            <circle cx="0"      cy="-22.8"  r="1.6" fill="var(--palette-purple-light)"/>
            <circle cx="26.02"  cy="-8.45"  r="1.6" fill="var(--palette-purple-light)"/>
            <circle cx="21.23"  cy="29.21"  r="1.6" fill="var(--palette-purple-light)"/>
            <circle cx="-11.17" cy="15.37"  r="1.6" fill="var(--palette-purple-light)"/>
            <circle cx="-27.10" cy="-8.81"  r="1.6" fill="var(--palette-purple-light)"/>
          </g>
          <circle r="3.2" fill="var(--palette-purple-light)" filter="url(#relay-glow)"/>
          <g fill="var(--palette-purple-light)" opacity="0.9">
            <rect x="-8.9" y="38.6"  width="1.8" height="4.8"  rx="0.6"/>
            <rect x="-4.9" y="38.12" width="1.8" height="5.76" rx="0.6"/>
            <rect x="-0.9" y="37.2"  width="1.8" height="7.6"  rx="0.6"/>
            <rect x="3.1"  y="39"    width="1.8" height="4.0"  rx="0.6"/>
            <rect x="7.1"  y="38"    width="1.8" height="6.0"  rx="0.6"/>
          </g>
        </g>

        <!-- KAI · (440, 100) r=38 · specialist · S=0.92 C=0.70 O=0.55 M=0.65 T=0.45 -->
        <g transform="translate(440 100)">
          <path d="M 0,-38 L 36.14,-11.74 L 22.34,30.74 L -22.34,30.74 L -36.14,-11.74 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.8" opacity="0.45"/>
          <path d="M 0,-25 L 23.78,-7.73 L 14.70,20.23 L -14.70,20.23 L -23.78,-7.73 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.4" opacity="0.25" stroke-dasharray="2 3"/>
          <path d="M 0,-13 L 12.36,-4.02 L 7.64,10.52 L -7.64,10.52 L -12.36,-4.02 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.4" opacity="0.22" stroke-dasharray="1 2"/>
          <g stroke="var(--palette-purple-light)" stroke-width="0.55" opacity="0.35">
            <line x1="0" y1="0" x2="0"      y2="-38"/>
            <line x1="0" y1="0" x2="36.14"  y2="-11.74"/>
            <line x1="0" y1="0" x2="22.34"  y2="30.74"/>
            <line x1="0" y1="0" x2="-22.34" y2="30.74"/>
            <line x1="0" y1="0" x2="-36.14" y2="-11.74"/>
          </g>
          <path d="M 0,-34.96 L 25.3,-8.22 L 12.29,16.91 L -14.52,19.98 L -16.26,-5.28 Z"
                fill="rgba(140,130,200,0.22)" stroke="var(--palette-purple-light)" stroke-width="1" opacity="0.92"/>
          <g>
            <circle cx="0"      cy="-34.96" r="1.6" fill="var(--palette-purple-light)"/>
            <circle cx="25.3"   cy="-8.22"  r="1.6" fill="var(--palette-purple-light)"/>
            <circle cx="12.29"  cy="16.91"  r="1.6" fill="var(--palette-purple-light)"/>
            <circle cx="-14.52" cy="19.98"  r="1.6" fill="var(--palette-purple-light)"/>
            <circle cx="-16.26" cy="-5.28"  r="1.6" fill="var(--palette-purple-light)"/>
          </g>
          <circle r="3.2" fill="var(--palette-purple-light)" filter="url(#relay-glow)"/>
          <g fill="var(--palette-purple-light)" opacity="0.9">
            <rect x="-8.9" y="37.32" width="1.8" height="7.36" rx="0.6"/>
            <rect x="-4.9" y="38.2"  width="1.8" height="5.6"  rx="0.6"/>
            <rect x="-0.9" y="38.8"  width="1.8" height="4.4"  rx="0.6"/>
            <rect x="3.1"  y="38.4"  width="1.8" height="5.2"  rx="0.6"/>
            <rect x="7.1"  y="39.2"  width="1.8" height="3.6"  rx="0.6"/>
          </g>
        </g>

        <!-- IRIS · (165, 245) r=40 · specialist · S=0.90 C=0.85 O=0.65 M=0.92 T=0.70 -->
        <g transform="translate(165 245)">
          <path d="M 0,-40 L 38.04,-12.36 L 23.52,32.36 L -23.52,32.36 L -38.04,-12.36 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.8" opacity="0.45"/>
          <path d="M 0,-27 L 25.68,-8.34 L 15.88,21.84 L -15.88,21.84 L -25.68,-8.34 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.4" opacity="0.25" stroke-dasharray="2 3"/>
          <path d="M 0,-13 L 12.36,-4.02 L 7.64,10.52 L -7.64,10.52 L -12.36,-4.02 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.4" opacity="0.22" stroke-dasharray="1 2"/>
          <g stroke="var(--palette-purple-light)" stroke-width="0.55" opacity="0.35">
            <line x1="0" y1="0" x2="0"      y2="-40"/>
            <line x1="0" y1="0" x2="38.04"  y2="-12.36"/>
            <line x1="0" y1="0" x2="23.52"  y2="32.36"/>
            <line x1="0" y1="0" x2="-23.52" y2="32.36"/>
            <line x1="0" y1="0" x2="-38.04" y2="-12.36"/>
          </g>
          <path d="M 0,-36 L 32.33,-10.51 L 15.29,21.03 L -21.64,29.77 L -26.63,-8.65 Z"
                fill="rgba(140,130,200,0.22)" stroke="var(--palette-purple-light)" stroke-width="1" opacity="0.92"/>
          <g>
            <circle cx="0"      cy="-36"    r="1.7" fill="var(--palette-purple-light)"/>
            <circle cx="32.33"  cy="-10.51" r="1.7" fill="var(--palette-purple-light)"/>
            <circle cx="15.29"  cy="21.03"  r="1.7" fill="var(--palette-purple-light)"/>
            <circle cx="-21.64" cy="29.77"  r="1.7" fill="var(--palette-purple-light)"/>
            <circle cx="-26.63" cy="-8.65"  r="1.7" fill="var(--palette-purple-light)"/>
          </g>
          <circle r="3.4" fill="var(--palette-purple-light)" filter="url(#relay-glow)"/>
          <g fill="var(--palette-purple-light)" opacity="0.9">
            <rect x="-8.9" y="40.4"  width="1.8" height="7.2"  rx="0.6"/>
            <rect x="-4.9" y="40.6"  width="1.8" height="6.8"  rx="0.6"/>
            <rect x="-0.9" y="41.4"  width="1.8" height="5.2"  rx="0.6"/>
            <rect x="3.1"  y="40.32" width="1.8" height="7.36" rx="0.6"/>
            <rect x="7.1"  y="41.2"  width="1.8" height="5.6"  rx="0.6"/>
          </g>
        </g>

        <!-- ALEX · (425, 255) r=36 · departed, ghost · S=0.80 C=0.78 O=0.68 M=0.95 T=0.90 -->
        <g transform="translate(425 255)" opacity="0.7">
          <path d="M 0,-36 L 34.24,-11.12 L 21.17,29.12 L -21.17,29.12 L -34.24,-11.12 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.7" opacity="0.35" stroke-dasharray="2 3"/>
          <path d="M 0,-24 L 22.82,-7.42 L 14.11,19.42 L -14.11,19.42 L -22.82,-7.42 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.35" opacity="0.22" stroke-dasharray="1 2"/>
          <path d="M 0,-12 L 11.41,-3.71 L 7.06,9.71 L -7.06,9.71 L -11.41,-3.71 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.35" opacity="0.2" stroke-dasharray="1 2"/>
          <g stroke="var(--palette-purple-light)" stroke-width="0.5" opacity="0.3" stroke-dasharray="1 2">
            <line x1="0" y1="0" x2="0"      y2="-36"/>
            <line x1="0" y1="0" x2="34.24"  y2="-11.12"/>
            <line x1="0" y1="0" x2="21.17"  y2="29.12"/>
            <line x1="0" y1="0" x2="-21.17" y2="29.12"/>
            <line x1="0" y1="0" x2="-34.24" y2="-11.12"/>
          </g>
          <path d="M 0,-28.8 L 26.70,-8.68 L 14.39,19.81 L -20.11,27.67 L -30.81,-10.01 Z"
                fill="none" stroke="var(--palette-purple-light)" stroke-width="0.9" opacity="0.75" stroke-dasharray="2.5 2"/>
          <g>
            <circle cx="0"      cy="-28.8"  r="1.8" fill="none" stroke="var(--palette-purple-light)" stroke-width="0.7" opacity="0.75"/>
            <circle cx="26.70"  cy="-8.68"  r="1.8" fill="none" stroke="var(--palette-purple-light)" stroke-width="0.7" opacity="0.75"/>
            <circle cx="14.39"  cy="19.81"  r="1.8" fill="none" stroke="var(--palette-purple-light)" stroke-width="0.7" opacity="0.75"/>
            <circle cx="-20.11" cy="27.67"  r="1.8" fill="none" stroke="var(--palette-purple-light)" stroke-width="0.7" opacity="0.75"/>
            <circle cx="-30.81" cy="-10.01" r="1.8" fill="none" stroke="var(--palette-purple-light)" stroke-width="0.7" opacity="0.75"/>
          </g>
          <line x1="-2.8" y1="-2.8" x2="2.8" y2="2.8" stroke="var(--palette-purple-light)" stroke-width="0.9" opacity="0.75"/>
          <line x1="-2.8" y1="2.8"  x2="2.8" y2="-2.8" stroke="var(--palette-purple-light)" stroke-width="0.9" opacity="0.75"/>
          <g stroke="var(--palette-purple-light)" stroke-width="0.6" stroke-dasharray="1 1" opacity="0.75" fill="none">
            <rect x="-8.9" y="36.8"  width="1.8" height="6.4"  rx="0.6"/>
            <rect x="-4.9" y="36.88" width="1.8" height="6.24" rx="0.6"/>
            <rect x="-0.9" y="37.28" width="1.8" height="5.44" rx="0.6"/>
            <rect x="3.1"  y="36.2"  width="1.8" height="7.6"  rx="0.6"/>
            <rect x="7.1"  y="36.4"  width="1.8" height="7.2"  rx="0.6"/>
          </g>
        </g>
      </svg>`,
  ranger: `<svg class="product-diagram" viewBox="0 0 511 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" aria-label="A dense fingerprint whorl with a wedge cut out of the upper right; the matching piece floats above, carrying the ridge segments that complete the pattern.">
        <defs>
          <radialGradient id="ranger-whorl-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stop-color="var(--palette-amber)" stop-opacity="0.18"/>
            <stop offset="60%" stop-color="var(--palette-amber)" stop-opacity="0.05"/>
            <stop offset="100%" stop-color="var(--palette-amber)" stop-opacity="0"/>
          </radialGradient>
        </defs>

        <!-- Corner crosshairs -->
        <g class="crosshair" stroke="var(--palette-amber)">
          <line x1="6" y1="6" x2="18" y2="6"/><line x1="6" y1="6" x2="6" y2="18"/>
          <line x1="505" y1="6" x2="493" y2="6"/><line x1="505" y1="6" x2="505" y2="18"/>
          <line x1="6" y1="314" x2="18" y2="314"/><line x1="6" y1="314" x2="6" y2="302"/>
          <line x1="505" y1="314" x2="493" y2="314"/><line x1="505" y1="314" x2="505" y2="302"/>
        </g>

        <!-- FINGERPRINT WHORL — "match by substance."
             A 12-ridge whorl whose upper-right wedge is absent. The
             piece floats above and carries the 12 matching ridge
             segments, each continuing its brief-side ridge at identical
             curvature. Specificity is carried by minutiae: three
             bifurcations, one termination, four island-fragments, and
             fifteen pore-dots. Only a piece carrying THIS substance
             could complete the pattern. -->

        <!-- Atmospheric glow behind the whorl -->
        <circle cx="175" cy="165" r="140" fill="url(#ranger-whorl-glow)"/>

        <!-- 12 concentric ridges, wedge absent 300°→360°.
             Ridge centres offset 1-3px in a zigzag for organic whorl.
             Opacity ramps from faint outer (0.22) to brightest core. -->

        <!-- Ridge 12 — outermost -->
        <path d="M 303,165 A 128 128 0 1 1 239,54.15"
              fill="none" stroke="var(--palette-amber)" stroke-width="0.9" opacity="0.22" stroke-linecap="round"/>
        <!-- Ridge 11 -->
        <path d="M 294,164 A 118 118 0 1 1 235,61.81"
              fill="none" stroke="var(--palette-amber)" stroke-width="0.9" opacity="0.3" stroke-linecap="round"/>
        <!-- Ridge 10 · BIFURCATION at ~130° -->
        <path d="M 285,163 A 108 108 0 1 1 231,69.47"
              fill="none" stroke="var(--palette-amber)" stroke-width="0.95" opacity="0.38" stroke-linecap="round"/>
        <path d="M 107.58,245.75 Q 103,249 99.71,251.5"
              fill="none" stroke="var(--palette-amber)" stroke-width="0.95" opacity="0.38" stroke-linecap="round"/>
        <!-- Ridge 9 · dashed rhythm -->
        <path d="M 275,166 A 98 98 0 1 1 226,81.13"
              fill="none" stroke="var(--palette-amber)" stroke-width="0.95" opacity="0.48"
              stroke-dasharray="3 2.5" stroke-linecap="round"/>
        <!-- Ridge 8 · BIFURCATION at ~165° -->
        <path d="M 264,167 A 88 88 0 1 1 220,90.79"
              fill="none" stroke="var(--palette-amber)" stroke-width="1" opacity="0.55" stroke-linecap="round"/>
        <path d="M 90.99,189.78 Q 84,190 78,188"
              fill="none" stroke="var(--palette-amber)" stroke-width="1" opacity="0.55" stroke-linecap="round"/>
        <!-- Ridge 7 -->
        <path d="M 252,167 A 78 78 0 1 1 213,99.45"
              fill="none" stroke="var(--palette-amber)" stroke-width="1" opacity="0.62" stroke-linecap="round"/>
        <!-- Ridge 6 · BIFURCATION at ~260° -->
        <path d="M 241,166 A 68 68 0 1 1 207,107.11"
              fill="none" stroke="var(--palette-amber)" stroke-width="1.05" opacity="0.7" stroke-linecap="round"/>
        <path d="M 161.19,99.03 Q 160,90 158.55,84.27"
              fill="none" stroke="var(--palette-amber)" stroke-width="1.05" opacity="0.7" stroke-linecap="round"/>
        <!-- Ridge 5 · dashed rhythm -->
        <path d="M 231,164 A 58 58 0 1 1 202,113.77"
              fill="none" stroke="var(--palette-amber)" stroke-width="1.05" opacity="0.78"
              stroke-dasharray="3 2.5" stroke-linecap="round"/>
        <!-- Ridge 4 · TERMINATION at ~220° — two segments with a tiny gap -->
        <path d="M 222,163 A 48 48 0 1 1 134.69,135.45"
              fill="none" stroke="var(--palette-amber)" stroke-width="1.1" opacity="0.82" stroke-linecap="round"/>
        <path d="M 140.06,129.06 A 48 48 0 0 1 198,121.43"
              fill="none" stroke="var(--palette-amber)" stroke-width="1.1" opacity="0.82" stroke-linecap="round"/>
        <circle cx="134.69" cy="135.45" r="0.85" fill="var(--palette-amber)" opacity="0.7"/>
        <circle cx="140.06" cy="129.06" r="0.85" fill="var(--palette-amber)" opacity="0.7"/>
        <!-- Ridge 3 -->
        <path d="M 213,164 A 38 38 0 1 1 194,131.09"
              fill="none" stroke="var(--palette-amber)" stroke-width="1.15" opacity="0.88" stroke-linecap="round"/>
        <!-- Ridge 2 -->
        <path d="M 204,166 A 28 28 0 1 1 190,141.75"
              fill="none" stroke="var(--palette-amber)" stroke-width="1.2" opacity="0.94" stroke-linecap="round"/>
        <!-- Ridge 1 · core — brightest -->
        <path d="M 193,165 A 18 18 0 1 1 184,149.41"
              fill="none" stroke="var(--palette-amber-light)" stroke-width="1.35" opacity="1" stroke-linecap="round"/>

        <!-- ISLAND RIDGES — 4 floating arc fragments -->
        <path d="M 72.73,141.37 A 105 105 0 0 1 78.29,123.94"
              fill="none" stroke="var(--palette-amber)" stroke-width="1" opacity="0.55" stroke-linecap="round"/>
        <path d="M 121.57,198.39 A 63 63 0 0 1 117.46,190.62"
              fill="none" stroke="var(--palette-amber)" stroke-width="0.95" opacity="0.6" stroke-linecap="round"/>
        <path d="M 193.71,253.03 A 90 90 0 0 1 182.84,254.66"
              fill="none" stroke="var(--palette-amber)" stroke-width="0.95" opacity="0.55" stroke-linecap="round"/>
        <path d="M 155.46,118.99 A 50 50 0 0 1 160.37,117.19"
              fill="none" stroke="var(--palette-amber)" stroke-width="0.95" opacity="0.6" stroke-linecap="round"/>

        <!-- PORE DOTS — 15 amber flecks distributed through the ridges -->
        <g fill="var(--palette-amber)">
          <circle cx="143.5"  cy="219.56" r="0.95" opacity="0.58"/>
          <circle cx="180.73" cy="197.5"  r="0.95" opacity="0.58"/>
          <circle cx="103.76" cy="105.22" r="0.95" opacity="0.5"/>
          <circle cx="152.35" cy="161.01" r="0.95" opacity="0.65"/>
          <circle cx="247.65" cy="251.56" r="0.95" opacity="0.48"/>
          <circle cx="175"    cy="200"    r="0.9"  opacity="0.62"/>
          <circle cx="142.86" cy="203.3"  r="0.9"  opacity="0.55"/>
          <circle cx="212.5"  cy="229.95" r="0.9"  opacity="0.55"/>
          <circle cx="247.77" cy="226.06" r="0.9"  opacity="0.48"/>
          <circle cx="125.85" cy="130.59" r="0.9"  opacity="0.58"/>
          <circle cx="96.22"  cy="151.11" r="0.9"  opacity="0.5"/>
          <circle cx="117.5"  cy="65.41"  r="0.85" opacity="0.42"/>
          <circle cx="166.45" cy="188.49" r="0.9"  opacity="0.7"/>
          <circle cx="110.05" cy="127.5"  r="0.9"  opacity="0.55"/>
          <circle cx="132.71" cy="180.39" r="0.9"  opacity="0.62"/>
        </g>

        <!-- Central pearl — origin of the whorl -->
        <circle cx="175" cy="165" r="3.8" fill="var(--palette-amber)"/>
        <circle cx="173.5" cy="163.5" r="1.3" fill="var(--palette-amber-light)"/>

        <!-- Cut-edge markers — outer + innermost -->
        <circle cx="303" cy="165"    r="2.2" fill="var(--palette-amber)"/>
        <circle cx="239" cy="54.15"  r="2.2" fill="var(--palette-amber)"/>
        <circle cx="193" cy="165"    r="1.3" fill="var(--palette-amber)" opacity="0.8"/>
        <circle cx="184" cy="149.41" r="1.3" fill="var(--palette-amber)" opacity="0.8"/>

        <!-- PIECE — the missing wedge's 12 matching ridge segments,
             floating upper-right. Translated (130,-40) drifting toward
             the gap. Ghost centre + matching cut-edge markers. -->
        <g transform="translate(130 -40)">
          <circle cx="175" cy="165" r="140" fill="url(#ranger-whorl-glow)" opacity="0.5"/>
          <circle cx="175" cy="165" r="3.4" fill="none" stroke="var(--palette-amber)" stroke-width="0.9"
                  stroke-dasharray="1.5 1.8" opacity="0.55"/>

          <!-- 12 matching ridge segments -->
          <path d="M 239,54.15 A 128 128 0 0 1 303,165"
                fill="none" stroke="var(--palette-amber)" stroke-width="0.9" opacity="0.28" stroke-linecap="round"/>
          <path d="M 235,61.81 A 118 118 0 0 1 294,164"
                fill="none" stroke="var(--palette-amber)" stroke-width="0.9" opacity="0.36" stroke-linecap="round"/>
          <path d="M 231,69.47 A 108 108 0 0 1 285,163"
                fill="none" stroke="var(--palette-amber)" stroke-width="0.95" opacity="0.44" stroke-linecap="round"/>
          <path d="M 226,81.13 A 98 98 0 0 1 275,166"
                fill="none" stroke="var(--palette-amber)" stroke-width="0.95" opacity="0.54"
                stroke-dasharray="3 2.5" stroke-linecap="round"/>
          <path d="M 220,90.79 A 88 88 0 0 1 264,167"
                fill="none" stroke="var(--palette-amber)" stroke-width="1" opacity="0.62" stroke-linecap="round"/>
          <path d="M 213,99.45 A 78 78 0 0 1 252,167"
                fill="none" stroke="var(--palette-amber)" stroke-width="1" opacity="0.68" stroke-linecap="round"/>
          <path d="M 207,107.11 A 68 68 0 0 1 241,166"
                fill="none" stroke="var(--palette-amber)" stroke-width="1.05" opacity="0.76" stroke-linecap="round"/>
          <path d="M 202,113.77 A 58 58 0 0 1 231,164"
                fill="none" stroke="var(--palette-amber)" stroke-width="1.05" opacity="0.82"
                stroke-dasharray="3 2.5" stroke-linecap="round"/>
          <path d="M 198,121.43 A 48 48 0 0 1 222,163"
                fill="none" stroke="var(--palette-amber)" stroke-width="1.1" opacity="0.88" stroke-linecap="round"/>
          <path d="M 194,131.09 A 38 38 0 0 1 213,164"
                fill="none" stroke="var(--palette-amber)" stroke-width="1.15" opacity="0.92" stroke-linecap="round"/>
          <path d="M 190,141.75 A 28 28 0 0 1 204,166"
                fill="none" stroke="var(--palette-amber)" stroke-width="1.2" opacity="0.96" stroke-linecap="round"/>
          <path d="M 184,149.41 A 18 18 0 0 1 193,165"
                fill="none" stroke="var(--palette-amber-light)" stroke-width="1.35" opacity="1" stroke-linecap="round"/>

          <!-- Piece's own minutiae: bifurcation + two islands + 5 pore dots -->
          <path d="M 232.57,99.59 Q 236,95 237.56,88.2"
                fill="none" stroke="var(--palette-amber)" stroke-width="1" opacity="0.62" stroke-linecap="round"/>
          <path d="M 244.63,116.23 A 85 85 0 0 1 251.35,127.76"
                fill="none" stroke="var(--palette-amber)" stroke-width="1" opacity="0.65" stroke-linecap="round"/>
          <path d="M 245.71,94.29 A 100 100 0 0 1 251.6,100.72"
                fill="none" stroke="var(--palette-amber)" stroke-width="0.95" opacity="0.55" stroke-linecap="round"/>
          <g fill="var(--palette-amber)">
            <circle cx="238.22" cy="128.5"  r="0.95" opacity="0.58"/>
            <circle cx="260"    cy="141"    r="0.95" opacity="0.52"/>
            <circle cx="210.36" cy="129.64" r="0.9"  opacity="0.62"/>
            <circle cx="259.57" cy="134.22" r="0.9"  opacity="0.48"/>
            <circle cx="197.98" cy="145.72" r="0.9"  opacity="0.68"/>
          </g>

          <!-- Matching cut-edge markers -->
          <circle cx="239" cy="54.15"  r="2.2" fill="var(--palette-amber)"/>
          <circle cx="303" cy="165"    r="2.2" fill="var(--palette-amber)"/>
          <circle cx="184" cy="149.41" r="1.3" fill="var(--palette-amber)" opacity="0.8"/>
          <circle cx="193" cy="165"    r="1.3" fill="var(--palette-amber)" opacity="0.8"/>
        </g>
      </svg>`,
};

export const ProductIllustration = ({
  variant,
}: {
  variant: ProductVariant;
}): JSX.Element => (
  <div
    className="h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
    dangerouslySetInnerHTML={{ __html: PRODUCT_SVGS[variant] }}
  />
);
