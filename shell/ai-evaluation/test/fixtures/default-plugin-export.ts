import type { Plugin } from "@brains/plugins";
import { fixturePlugin } from "./fixture-plugin";

export const aFirstPlugin: Plugin = fixturePlugin("first");

const defaultPlugin: Plugin = fixturePlugin("default");

export default defaultPlugin;
