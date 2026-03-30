/**
 * Bug 2 (Moderate): Via sizes don't match KiCad design rules
 *
 * The capacity-autorouter can output vias with outer_diameter=0.3mm /
 * hole_diameter=0.2mm. KiCad's minimum via size is 0.5mm outer / 0.3mm drill.
 * AddViasStage passes values straight through without clamping to minimums,
 * causing DRC via-size violations in KiCad.
 *
 * To run: bun test tests/pcb/repros/repro09-via-size-kicad-rules.test.tsx
 */
import { test, expect } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import circuitJson from "tests/assets/repro09-555-timer-circuit-small-vias.json"

test("repro09: via sizes below KiCad minimums (0.3mm/0.2mm) pass through unchanged", () => {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  Bun.write("./debug-output/repro09-via-size-kicad-rules.kicad_pcb", output)

  const viaSizeMatches = [
    ...output.matchAll(
      /\(via\b[\s\S]*?\(size ([\d.]+)\)[\s\S]*?\(drill ([\d.]+)\)/g,
    ),
  ]
  const subMinVias = viaSizeMatches.filter(
    (m) => Number(m[1]) < 0.5 || Number(m[2]) < 0.3,
  )

  // BUG: AddViasStage:113 uses `via.outer_diameter || 0.8` with no minimum clamp
  // All vias should be clamped to KiCad minimums (0.5mm outer / 0.3mm drill)
  expect(subMinVias.length).toBeGreaterThan(0) // all 10 vias written as 0.3mm/0.2mm (should be 0 after fix)
})
