import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx|jsx)$/.test(name) ? [path] : [];
  });
}

describe("coded selectors", () => {
  it("does not render browser-native select elements under src", () => {
    const root = join(process.cwd(), "src");
    const offenders = sourceFiles(root)
      .filter((file) => /<select(?:\s|>)/i.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });
});
