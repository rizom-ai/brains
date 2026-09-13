/** @jsxImportSource react */
import type { JSX } from "react";

// Static illustration geometry from the approved preview. Live maps are not copied here.
export function LanternMark(): JSX.Element {
  return (
    <svg
      className="mark"
      viewBox="0 0 480 292"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="lantern-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5"></feGaussianBlur>
        </filter>
        <radialGradient id="lantern-aura">
          <stop
            offset="0"
            stopColor="var(--color-accent)"
            stopOpacity=".42"
          ></stop>
          <stop
            offset=".22"
            stopColor="var(--color-accent)"
            stopOpacity=".19"
          ></stop>
          <stop
            offset=".55"
            stopColor="var(--color-accent)"
            stopOpacity=".055"
          ></stop>
          <stop
            offset="1"
            stopColor="var(--color-accent)"
            stopOpacity="0"
          ></stop>
        </radialGradient>
        <radialGradient id="lantern-bulb">
          <stop offset="0" stopColor="var(--lantern-hot)"></stop>
          <stop
            offset=".16"
            stopColor="var(--lantern-hot)"
            stopOpacity=".95"
          ></stop>
          <stop
            offset=".3"
            stopColor="var(--lantern-light)"
            stopOpacity=".8"
          ></stop>
          <stop
            offset=".6"
            stopColor="var(--color-accent)"
            stopOpacity=".2"
          ></stop>
          <stop
            offset="1"
            stopColor="var(--color-accent)"
            stopOpacity="0"
          ></stop>
        </radialGradient>
        <linearGradient id="lantern-ray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--lantern-hot)"></stop>
          <stop offset=".23" stopColor="var(--lantern-light)"></stop>
          <stop
            offset="1"
            stopColor="var(--color-accent)"
            stopOpacity=".38"
          ></stop>
        </linearGradient>
        <radialGradient
          id="lantern-membrane"
          gradientUnits="userSpaceOnUse"
          cx="0"
          cy="-112"
          r="263"
        >
          <stop
            offset="0"
            stopColor="var(--lantern-light)"
            stopOpacity=".42"
          ></stop>
          <stop
            offset=".22"
            stopColor="var(--color-accent)"
            stopOpacity=".15"
          ></stop>
          <stop
            offset=".65"
            stopColor="var(--color-accent)"
            stopOpacity=".025"
          ></stop>
          <stop
            offset="1"
            stopColor="var(--color-accent)"
            stopOpacity="0"
          ></stop>
        </radialGradient>

        <g id="lantern-light">
          <circle cx="0" cy="-112" r="164" fill="url(#lantern-aura)"></circle>
          <path
            d="M0 -112 L117.78 92 L-117.78 92 Z"
            fill="url(#lantern-membrane)"
          ></path>
          <path
            className="filament filament--bloom"
            d="M-117.78 92 L0 -112 L117.78 92"
            stroke="url(#lantern-ray)"
          ></path>
          <path
            className="filament filament--lit"
            d="M-117.78 92 L0 -112 L117.78 92"
            stroke="url(#lantern-ray)"
          ></path>
          <g transform="translate(0 -112)">
            <g className="aura">
              <circle r="54" fill="url(#lantern-aura)"></circle>
              <circle r="36" fill="var(--color-accent)" opacity=".04"></circle>
              <circle r="23" className="node-ring"></circle>
            </g>
            <circle r="22" fill="url(#lantern-bulb)"></circle>
            <circle r="5.5" className="node-core"></circle>
          </g>
        </g>
      </defs>

      <g transform="translate(240 180)">
        <path className="triangle" d="M0 -136 L117.78 68 L-117.78 68 Z"></path>
        <circle className="node-rest" cx="0" cy="-136" r="3.5"></circle>
        <circle className="node-rest" cx="117.78" cy="68" r="3.5"></circle>
        <circle className="node-rest" cx="-117.78" cy="68" r="3.5"></circle>
        <g className="light-state light-0">
          <use href="#lantern-light" y="-24"></use>
        </g>
        <g className="light-state light-1" transform="rotate(120)">
          <use href="#lantern-light" y="-24"></use>
        </g>
        <g className="light-state light-2" transform="rotate(240)">
          <use href="#lantern-light" y="-24"></use>
        </g>
      </g>
    </svg>
  );
}

export function OrganismDefs(): JSX.Element {
  return (
    <svg
      className="organism-defs"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="org-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3"></feGaussianBlur>
        </filter>
        <radialGradient id="org-brain-light">
          <stop stopColor="var(--palette-brass)" stopOpacity=".36"></stop>
          <stop
            offset=".3"
            stopColor="var(--palette-brass)"
            stopOpacity=".13"
          ></stop>
          <stop
            offset="1"
            stopColor="var(--palette-brass)"
            stopOpacity="0"
          ></stop>
        </radialGradient>
        <radialGradient id="org-team-light">
          <stop stopColor="var(--palette-ruby-soft)" stopOpacity=".38"></stop>
          <stop
            offset=".3"
            stopColor="var(--palette-ruby-soft)"
            stopOpacity=".12"
          ></stop>
          <stop
            offset="1"
            stopColor="var(--palette-ruby-soft)"
            stopOpacity="0"
          ></stop>
        </radialGradient>
        <radialGradient id="org-net-light">
          <stop stopColor="var(--palette-moss)" stopOpacity=".4"></stop>
          <stop
            offset=".3"
            stopColor="var(--palette-moss)"
            stopOpacity=".13"
          ></stop>
          <stop
            offset="1"
            stopColor="var(--palette-moss)"
            stopOpacity="0"
          ></stop>
        </radialGradient>
        <linearGradient
          id="org-thread"
          gradientUnits="userSpaceOnUse"
          x1="180"
          y1="0"
          x2="940"
          y2="0"
        >
          <stop stopColor="var(--palette-brass)" stopOpacity=".85"></stop>
          <stop
            offset=".5"
            stopColor="var(--palette-ruby-soft)"
            stopOpacity=".6"
          ></stop>
          <stop
            offset="1"
            stopColor="var(--palette-moss)"
            stopOpacity=".65"
          ></stop>
        </linearGradient>
        <symbol id="org-brain" viewBox="-90 -90 180 180" overflow="visible">
          <circle r="85" fill="url(#org-brain-light)"></circle>
          <circle r="38" fill="url(#org-brain-light)"></circle>
          <circle r="23" className="organism-halo"></circle>
          <circle r="10" fill="currentColor" opacity=".18"></circle>
          <circle r="6.5" fill="currentColor"></circle>
          <circle r="3.6" className="organism-hot"></circle>
        </symbol>
        <symbol id="org-team" viewBox="-90 -90 180 180" overflow="visible">
          <circle cx="0" cy="-52" r="73" fill="url(#org-team-light)"></circle>
          <path
            d="M0 -52 L48 30 L-48 30 Z"
            fill="color-mix(in srgb, var(--palette-ruby-soft) 3%, transparent)"
          ></path>
          <path className="organism-wire" d="M-48 30 L0 -52 L48 30 Z"></path>
          <path
            className="organism-wire"
            d="M-48 30 L0 -52 L48 30"
            filter="url(#org-blur)"
            opacity=".4"
          ></path>
          <circle cx="-48" cy="30" r="20" fill="url(#org-team-light)"></circle>
          <circle cx="48" cy="30" r="20" fill="url(#org-team-light)"></circle>
          <circle cx="-48" cy="30" r="3.7" className="organism-peer"></circle>
          <circle cx="48" cy="30" r="3.7" className="organism-peer"></circle>
          <circle cx="0" cy="-52" r="16" className="organism-halo"></circle>
          <circle cx="0" cy="-52" r="23" fill="url(#org-team-light)"></circle>
          <circle cx="0" cy="-52" r="4.5" fill="currentColor"></circle>
          <circle cx="0" cy="-52" r="2.4" className="organism-hot"></circle>
        </symbol>
        <symbol id="org-network" viewBox="-90 -90 180 180" overflow="visible">
          <circle r="89" fill="url(#org-net-light)" opacity=".35"></circle>
          <path
            className="organism-wire organism-wire-faint"
            d="M-33 12 Q-2 -14 22 -8 M-33 12 Q-13 42 9 36 M22 -8 Q51 3 65 24 M-45 -30 Q-9 -63 32 -58 M-70 -8 L-70 64 M67 -24 L78 3 M-45 -30 L-60 -68"
          ></path>
          <path
            className="organism-wire"
            d="M-45 -30 L-70 -8 L-33 12 Z M32 -58 L67 -24 L22 -8 Z M9 36 L48 68 L65 24 Z"
          ></path>
          <path
            className="organism-wire"
            d="M-33 12 Q-2 -14 22 -8 M22 -8 Q51 3 65 24"
            filter="url(#org-blur)"
          ></path>
          <circle cx="-45" cy="-30" r="32" fill="url(#org-net-light)"></circle>
          <circle cx="32" cy="-58" r="27" fill="url(#org-net-light)"></circle>
          <circle cx="9" cy="36" r="29" fill="url(#org-net-light)"></circle>
          <circle cx="-45" cy="-30" r="4" fill="currentColor"></circle>
          <circle cx="-45" cy="-30" r="2" className="organism-hot"></circle>
          <circle cx="32" cy="-58" r="3.8" fill="currentColor"></circle>
          <circle cx="32" cy="-58" r="1.8" className="organism-hot"></circle>
          <circle cx="9" cy="36" r="3.8" fill="currentColor"></circle>
          <circle cx="9" cy="36" r="1.8" className="organism-hot"></circle>
          <circle cx="-70" cy="-8" r="2.8" className="organism-peer"></circle>
          <circle cx="-33" cy="12" r="3" className="organism-peer"></circle>
          <circle cx="67" cy="-24" r="3" className="organism-peer"></circle>
          <circle cx="22" cy="-8" r="2.8" className="organism-peer"></circle>
          <circle cx="48" cy="68" r="3" className="organism-peer"></circle>
          <circle cx="65" cy="24" r="2.8" className="organism-peer"></circle>
          <g opacity=".4">
            <circle cx="-70" cy="64" r="2.6" className="organism-peer"></circle>
            <circle cx="78" cy="3" r="2.6" className="organism-peer"></circle>
            <circle
              cx="-60"
              cy="-68"
              r="2.6"
              className="organism-peer"
            ></circle>
          </g>
        </symbol>
      </defs>
    </svg>
  );
}

export function OrganismMap(): JSX.Element {
  return (
    <svg
      className="organism-map"
      viewBox="0 0 1080 280"
      role="img"
      aria-labelledby="organism-map-title organism-map-desc"
    >
      <title id="organism-map-title">
        One brain becomes a team, then a network
      </title>
      <desc id="organism-map-desc">
        A brass light branches into a ruby triangle of people, then into three
        connected moss-green clusters. The same triangular form grows from the
        team's memory into a wider network.
      </desc>
      <path
        className="organism-ray-soft"
        d="M180 142 C302 81 403 54 540 90 M588 172 C702 165 754 88 855 112"
      ></path>
      <path
        className="organism-ray"
        d="M180 142 C302 81 403 54 540 90 M588 172 C702 165 754 88 855 112"
      ></path>
      <path
        className="organism-ray organism-ray-fine"
        d="M180 142 C284 177 391 208 492 172 M540 90 C665 32 793 29 932 84 M492 172 C621 240 791 239 909 178"
      ></path>
      <circle
        cx="180"
        cy="142"
        r="126"
        fill="url(#org-brain-light)"
        opacity=".35"
      ></circle>
      <circle
        cx="540"
        cy="142"
        r="112"
        fill="url(#org-team-light)"
        opacity=".24"
      ></circle>
      <circle
        cx="900"
        cy="142"
        r="126"
        fill="url(#org-net-light)"
        opacity=".25"
      ></circle>
      <use
        href="#org-brain"
        className="organism-brain"
        x="90"
        y="52"
        width="180"
        height="180"
      ></use>
      <use
        href="#org-team"
        className="organism-team"
        x="450"
        y="52"
        width="180"
        height="180"
      ></use>
      <use
        href="#org-network"
        className="organism-network"
        x="810"
        y="52"
        width="180"
        height="180"
      ></use>
    </svg>
  );
}

export function BrainMark(): JSX.Element {
  return (
    <svg className="organism-mini" viewBox="0 0 320 96" aria-hidden="true">
      <path className="organism-branch" d="M12 60 C58 60 110 60 160 60"></path>
      <use href="#org-brain" x="90" y="-10" width="140" height="140"></use>
    </svg>
  );
}

export function PracticeMark(): JSX.Element {
  return (
    <svg className="organism-mini" viewBox="0 0 320 104" aria-hidden="true">
      <path className="organism-branch" d="M12 43 C57 43 114 1 160 20"></path>
      <use href="#org-team" x="90" y="-10" width="140" height="140"></use>
    </svg>
  );
}

export function NetworkMark(): JSX.Element {
  return (
    <svg className="organism-mini" viewBox="0 0 320 132" aria-hidden="true">
      <path className="organism-branch" d="M12 42 C53 42 92 56 125 37"></path>
      <use href="#org-network" x="90" y="-10" width="140" height="140"></use>
    </svg>
  );
}
