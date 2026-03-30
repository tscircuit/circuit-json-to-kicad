/**
 * Bug 3 (Moderate): Trace width default is wrong
 *
 * AddTracesStage uses `trace.width || 0.25`. The capacity-autorouter puts
 * width per route point (0.15mm) and never sets a top-level trace.width.
 * So trace.width is undefined → 0.25mm fallback inflates every trace.
 *
 * To run: bun test tests/pcb/repros/repro10-trace-width-per-point.test.tsx
 */
import { test, expect } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import circuitJson from "tests/assets/555-timer-circuit.json"

test("repro10: trace width inflated from per-point 0.15mm to fallback 0.25mm", () => {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  Bun.write("./debug-output/repro10-trace-width-per-point.kicad_pcb", output)

  const segmentWidths = [
    ...output.matchAll(/\(segment\b[\s\S]*?\(width ([\d.]+)\)/g),
  ].map((m) => Number(m[1]))

  const correctCount = segmentWidths.filter((w) => w === 0.15).length

  // BUG: AddTracesStage:116 — `width: trace.width || 0.25`
  // trace.width is undefined → 0.25 used instead of startPoint.width (0.15)
  expect(correctCount).toBe(0) // all 102 segments get 0.25, not 0.15 (should equal segmentWidths.length after fix)
})
