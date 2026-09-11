import { createHash } from "node:crypto"
import { parseKicadMod } from "kicadts"

/** Keep metadata snapshots readable while still detecting any glyph geometry change. */
export function summarizeFootprintSilkscreen(content: string | Buffer) {
  const footprint = parseKicadMod(content.toString())
  const polygons = footprint.fpPolys.filter((p) =>
    /[FB]\.SilkS/.test(p.layer?.getString() ?? ""),
  )
  footprint.fpPolys = footprint.fpPolys.filter((p) => !polygons.includes(p))
  const hash = createHash("sha256")
    .update(polygons.map((p) => p.getString()).join("\n"))
    .digest("hex")
  return `${footprint.getString()}\nSilkscreen polygons: ${polygons.length}\nSilkscreen geometry SHA256: ${hash}`
}
