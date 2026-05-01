import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

/**
 * Issue #191: pcb_silkscreen_rect elements owned by a component must be
 * exported as fp_rect inside the footprint — not silently dropped, and not as
 * board-level gr_rect (which would make them immovable in KiCad).
 */
test("pcb_silkscreen_rect is exported as fp_rect inside footprint, not dropped or gr_rect", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="U1"
        footprint={
          <footprint>
            <smtpad
              portHints={["1"]}
              pcbX={0}
              pcbY={0}
              width="1mm"
              height="1mm"
              shape="rect"
            />
            {/* Top silkscreen rect centred on the component */}
            <silkscreenrect
              pcbX={0}
              pcbY={0}
              width={4}
              height={3}
              layer="top"
            />
            {/* Bottom silkscreen rect — different layer */}
            <silkscreenrect
              pcbX={0}
              pcbY={0}
              width={4}
              height={3}
              layer="bottom"
            />
          </footprint>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]

  // circuit-json must produce the silkscreen rects with pcb_component_id set
  const silkscreenRects = circuitJson.filter(
    (e: any) => e.type === "pcb_silkscreen_rect",
  )
  expect(silkscreenRects.length).toBeGreaterThanOrEqual(2)
  for (const r of silkscreenRects) {
    expect(r.pcb_component_id).toBeTruthy()
  }

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  // Must produce fp_rect (inside footprint) — not silently dropped
  expect(outputString).toContain("fp_rect")

  // Both silkscreen layers must appear
  expect(outputString).toContain("F.SilkS")
  expect(outputString).toContain("B.SilkS")

  // Must NOT produce board-level gr_rect — component silkscreen belongs inside
  // the footprint so it moves with the component in KiCad.
  const grRectLines = outputString
    .split("\n")
    .filter((l) => l.includes("gr_rect"))
  expect(grRectLines.length).toBe(0)

  // Coordinate sanity: width=4mm, height=3mm → half-extents 2 and 1.5.
  // The fp_rect start corner should be at (-2, -1.5) in footprint-local coords.
  expect(outputString).toMatch(/\(start\s+-?2\s+-?1\.5\)/)
  expect(outputString).toMatch(/\(end\s+2\s+1\.5\)/)
})

/**
 * A second component with a silkscreen rect offset from its center verifies
 * the coordinate transform (subtract component center, flip Y axis).
 */
test("pcb_silkscreen_rect coordinates are correctly transformed to footprint-local space", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="30mm">
      <chip
        name="U1"
        pcbX={5}
        pcbY={3}
        footprint={
          <footprint>
            <smtpad
              portHints={["1"]}
              pcbX={0}
              pcbY={0}
              width="1mm"
              height="1mm"
              shape="rect"
            />
            {/* Rect centred at component origin (0,0) in footprint-local coords */}
            <silkscreenrect
              pcbX={0}
              pcbY={0}
              width={2}
              height={2}
              layer="top"
            />
          </footprint>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  expect(outputString).toContain("fp_rect")

  // Width=2, height=2 → half-extents 1 and 1.
  // In footprint-local coords the rect should span (-1,-1) to (1,1).
  expect(outputString).toMatch(/\(start\s+-1\s+-1\)/)
  expect(outputString).toMatch(/\(end\s+1\s+1\)/)
})
