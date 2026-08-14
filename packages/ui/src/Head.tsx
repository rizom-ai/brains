import type { HeadCollectorInterface, HeadProps } from "@brains/contracts";
import {
  createContext,
  createElement as h,
  type Context,
  type JSX,
  type ReactNode,
  useContext,
} from "react";

export type { HeadCollectorInterface, HeadProps } from "@brains/contracts";

/**
 * Context for sharing the HeadCollector during SSR
 * The collector is provided by the site builder during rendering
 */
export const HeadContext: Context<HeadCollectorInterface | null> =
  createContext<HeadCollectorInterface | null>(null);

/**
 * Provider component that makes HeadCollector available to child components
 */
export interface HeadProviderProps {
  headCollector: HeadCollectorInterface;
  children: ReactNode;
}

export function HeadProvider({
  headCollector,
  children,
}: HeadProviderProps): JSX.Element {
  return h(HeadContext.Provider, { value: headCollector }, children);
}

/**
 * Hook to access the HeadCollector from context
 */
export function useHead(): HeadCollectorInterface | null {
  return useContext(HeadContext);
}

/**
 * Head component that sets metadata during SSR
 * This component doesn't render anything, it just collects metadata
 */
export function Head(props: HeadProps): null {
  const headCollector = useHead();

  if (headCollector) {
    headCollector.setHeadProps(props);
  }

  return null;
}
