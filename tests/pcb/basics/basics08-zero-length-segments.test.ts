import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("zero-length segments are skipped (issue #242)", () => {
  // A trace with duplicate consecutive route points should not produce
  // zero-length KiCad segments, which trigger DRC "trace crossing" errors.
  const circuitJson: any[] = [
    {
      type: "source_component",
      source_component_id: "sc1",
      name: "R1",
      ftype: "simple_resistor",
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "trace1",
      route: [
        { route_type: "wire", x: 0, y: 0, width: 0.25, layer: "top" },
        // Duplicate point — should produce a zero-length segment that we skip
        { route_type: "wire", x: 0, y: 0, width: 0.25, layer: "top" },
        { route_type: "wire", x: 1, y: 0, width: 0.25, layer: "top" },
      ],
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const pcb = converter.getOutput()

  // There should be exactly 1 segment (the valid 0,0 → 1,0 one).
  // If zero-length filtering is missing, there would be 2 segments.
  expect(pcb.segments.length).toBe(1)

  const seg = pcb.segments[0]
  // The segment should span from (0,0) to (1,0) in KiCad coordinates
  // (y-axis is flipped in KiCad, but x difference should be non-zero)
  const dx = Math.abs(seg.end.x - seg.start.x)
  const dy = Math.abs(seg.end.y - seg.start.y)
  expect(dx + dy).toBeGreaterThan(0)
})
