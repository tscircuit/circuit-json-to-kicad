/**
 * Bug 2 (Moderate): Explicit via sizes are clamped instead of preserved
 *
 * Circuit JSON vias can legitimately carry explicit outer and drill diameters.
 * The KiCad exporter should copy those values through verbatim rather than
 * force them up to a hard-coded default.
 *
 * To run: bun test tests/pcb/repros/repro09-via-size-kicad-rules.test.tsx
 */
import { test, expect } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import circuitJson from "tests/assets/repro09-555-timer-circuit-small-vias.json"

test("repro09: standalone vias preserve explicit 0.3mm/0.2mm dimensions", () => {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  Bun.write("./debug-output/repro09-via-size-kicad-rules.kicad_pcb", output)

  const viaSizeMatches = [
    ...output.matchAll(
      /\(via\b[\s\S]*?\(size ([\d.]+)\)[\s\S]*?\(drill ([\d.]+)\)/g,
    ),
  ]
  const uniquePairs = [
    ...new Set(viaSizeMatches.map((m) => `${m[1]}/${m[2]}`)),
  ].sort()

  expect(viaSizeMatches).toHaveLength(10)
  expect(uniquePairs).toEqual(["0.3/0.2"])
})
