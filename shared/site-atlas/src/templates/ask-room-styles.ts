/**
 * The Ask room's styles, for every page that presents the box beside a
 * drawing (see the room attributes in @brains/contracts ask-box and the room
 * script). Theme tokens only; a page positions its own lead layer and
 * drawing, and sets --ask-column-clear to what its column keeps clear of the
 * screen's height.
 */
export const ASK_ROOM_STYLES: string = String.raw`
/* On a wide screen the text column is the one scroller beside the drawing,
   and the conversation grows in it instead of scrolling inside a band. */
@media not all and (max-width: 60rem) {
  [data-ask-column] {
    max-height: calc(100svh - var(--ask-column-clear, 4.5rem));
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--color-rule) transparent;
  }
}
[data-ask-room] .brain-guest-box:not(.is-sheet) > .brain-box-scroll {
  max-height: none;
  overflow: visible;
  mask-image: none;
  padding-bottom: 0;
}
/* Leads from an answer's listed sources to their marks, drawn by the room script. */
[data-ask-leads] {
  overflow: visible;
  pointer-events: none;
}
[data-ask-leads] path {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-dasharray: 0.1 6;
}
/* A listed source brought into view by its mark. */
[data-ask-source][data-ask-flash] {
  animation: ask-flash 1.5s ease-out;
}
@keyframes ask-flash {
  0%,
  40% {
    background: rgb(from var(--color-accent) r g b / 0.14);
  }
  100% {
    background: transparent;
  }
}
@media (max-width: 60rem) {
  [data-ask-leads] {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-ask-leads] {
    display: none;
  }
  [data-ask-source][data-ask-flash] {
    animation: none;
  }
}
`;
