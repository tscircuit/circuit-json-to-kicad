import { expect, type MatcherResult } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"

const normalizeSvg = (svg: string): string =>
  svg
    .replace(
      /(<title>SVG Image created as .*? date )[^<]+( <\/title>)/,
      "$1[normalized]$2",
    )
    .replace(/[ \t]+$/gm, "")

/** Match a deterministic SVG string against a reviewable .snap.svg file. */
function toMatchSvgSnapshot(
  // biome-ignore lint/suspicious/noExplicitAny: bun does not expose matcher context
  this: any,
  received: string,
  testPathOriginal: string,
  svgName?: string,
): MatcherResult {
  const testPath = testPathOriginal
    .replace(/\.test\.tsx?$/, "")
    .replace(/\.test\.ts$/, "")
  const snapshotDir = path.join(path.dirname(testPath), "__snapshots__")
  const snapshotName = svgName
    ? `${svgName}.snap.svg`
    : `${path.basename(testPath)}.snap.svg`
  const filePath = path.join(snapshotDir, snapshotName)
  const updateSnapshot =
    process.argv.includes("--update-snapshots") ||
    process.argv.includes("-u") ||
    Boolean(process.env["BUN_UPDATE_SNAPSHOTS"])
  const normalizedReceived = normalizeSvg(received)

  fs.mkdirSync(snapshotDir, { recursive: true })
  if (!fs.existsSync(filePath) || updateSnapshot) {
    fs.writeFileSync(filePath, normalizedReceived)
    return {
      message: () => `SVG snapshot written to ${filePath}`,
      pass: true,
    }
  }

  const expected = fs.readFileSync(filePath, "utf8")
  const pass = expected === normalizedReceived
  return {
    message: () =>
      pass
        ? "SVG snapshot matches"
        : `SVG snapshot differs from ${filePath}; rerun with --update-snapshots to update it`,
    pass,
  }
}

expect.extend({
  toMatchSvgSnapshot: toMatchSvgSnapshot as any,
})

declare module "bun:test" {
  interface Matchers<T = unknown> {
    toMatchSvgSnapshot(testPath: string, svgName?: string): MatcherResult
  }
}
