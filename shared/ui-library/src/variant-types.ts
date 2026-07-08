import type { ClassProp } from "class-variance-authority/types";

export type VariantValue<T extends number | string> = T | null | undefined;

export type VariantFunction<TProps> = (props?: TProps & ClassProp) => string;
