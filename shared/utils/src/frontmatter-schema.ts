import * as yaml from "js-yaml";
import { isRecord } from "./is-record";

/* Numeric grammar adapted from js-yaml 3 (MIT):
 * Copyright (C) 2011-2015 by Vitaly Puzrin
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

// Owned durable-data policy: frontmatter-yaml-scalar-semantics in the legacy
// inventory. Do not reinterpret stored octal/base-60 values during a parser
// dependency migration. Other YAML consumers keep the default YAML 4 schema.
const integerPattern =
  /^[+-]?(?:0|0b[01_]*[01]|0x[\da-fA-F_]*[\da-fA-F]|0[0-7_]*[0-7]|[1-9](?:[\d_]*\d)?|[1-9][\d_]*(?::[0-5]?\d)+)$/;
const floatPattern =
  /^(?:[-+]?(?:0|[1-9][\d_]*)(?:\.[\d_]*)?(?:[eE][-+]?\d+)?|\.[\d_]+(?:[eE][-+]?\d+)?|[-+]?\d[\d_]*(?::[0-5]?\d)+\.[\d_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;

// js-yaml publicly exports its built-in types for custom schemas, but
// @types/js-yaml omits that export. Check it rather than asserting its shape.
function builtin(name: "int" | "float" | "binary"): yaml.Type {
  const types: unknown = Reflect.get(yaml, "types");
  const type = isRecord(types) ? types[name] : undefined;
  if (!(type instanceof yaml.Type)) {
    throw new Error(`Required YAML type is unavailable: ${name}`);
  }
  return type;
}

function base60(value: string, floating: boolean): number {
  let result = 0;
  let weight = 1;
  for (const part of value.split(":").reverse()) {
    result +=
      (floating ? Number.parseFloat(part) : Number.parseInt(part, 10)) * weight;
    weight *= 60;
  }
  return result;
}

function numericType(name: "int" | "float"): yaml.Type {
  const type = builtin(name);
  return new yaml.Type(`tag:yaml.org,2002:${name}`, {
    kind: "scalar",
    resolve: (data: unknown): boolean =>
      typeof data === "string" &&
      (name === "int" ? integerPattern : floatPattern).test(data) &&
      !data.endsWith("_"),
    construct: (data: string): unknown => {
      const value = data.replace(/_/g, "");
      const sign = value.startsWith("-") ? -1 : 1;
      const unsigned = value.replace(/^[+-]/, "");
      if (unsigned.includes(":"))
        return sign * base60(unsigned, name === "float");
      if (name === "int" && unsigned === "0") return 0;
      if (name === "int" && /^0[0-7]+$/.test(unsigned)) {
        return sign * Number.parseInt(unsigned, 8);
      }
      const result: unknown = type.construct(value);
      return result;
    },
    predicate: type.predicate ?? undefined,
    represent: type.represent ?? undefined,
    defaultStyle: type.defaultStyle ?? undefined,
  });
}

const binary = builtin("binary");
const binaryType = new yaml.Type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: (data: unknown): boolean => binary.resolve(data),
  construct: (data: string): Buffer | number[] => {
    const bytes: unknown = binary.construct(data);
    if (!(bytes instanceof Uint8Array))
      throw new Error("Invalid YAML binary result");
    return typeof Buffer === "undefined"
      ? Array.from(bytes)
      : Buffer.from(bytes);
  },
  predicate: (value: object): boolean =>
    typeof Buffer !== "undefined" && Buffer.isBuffer(value),
  represent: binary.represent ?? undefined,
});

// YAML 3 quoted colon-containing strings, including provider IDs and URLs.
// An implicit string resolver preserves that writer contract without changing
// their values or using post-processing that could corrupt quoted/block text.
const colonString = new yaml.Type("tag:yaml.org,2002:str", {
  kind: "scalar",
  resolve: (data: unknown): boolean =>
    typeof data === "string" && data.includes(":"),
  construct: (data: string): string => data,
});

export const frontmatterSchema: yaml.Schema = yaml.DEFAULT_SCHEMA.extend({
  implicit: [numericType("int"), numericType("float"), colonString],
  explicit: [binaryType],
});
