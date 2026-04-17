/**
 * Bug 5 (Moderate): Standalone via diameters are rounded up to 0.5mm/0.3mm
 *
 * The exporter should preserve explicit standalone via sizes instead of
 * clamping them to a hard-coded minimum.
 *
 * To run: bun test tests/pcb/repros/repro12-standalone-via-size-copy.test.tsx
 */
import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("repro12: standalone 0.4mm via stays 0.4mm in KiCad output", () => {
  const circuitJson = [
    {
      type: "pcb_via",
      x: 1,
      y: 2,
      outer_diameter: 0.4,
      hole_diameter: 0.2,
      from_layer: "top",
      to_layer: "bottom",
    },
  ] as any

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  const viaMatch = output.match(
    /\(via\b[\s\S]*?\(size ([\d.]+)\)[\s\S]*?\(drill ([\d.]+)\)/,
  )

  expect(viaMatch).not.toBeNull()
  expect(Number(viaMatch![1])).toBe(0.4)
  expect(Number(viaMatch![2])).toBe(0.2)
})
