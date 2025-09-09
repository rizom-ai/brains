declare module "react-helmet-async" {
  import { Component, ComponentChildren } from "preact";

  export interface HelmetProps {
    children?: ComponentChildren;
  }

  export class Helmet extends Component<HelmetProps> {}

  export interface HelmetServerState {
    title?: { toString(): string };
    meta?: { toString(): string };
    link?: { toString(): string };
    script?: { toString(): string };
    noscript?: { toString(): string };
    style?: { toString(): string };
  }

  export interface HelmetProviderProps {
    children?: ComponentChildren;
    context?: { helmet?: HelmetServerState };
  }

  export class HelmetProvider extends Component<HelmetProviderProps> {}
}
