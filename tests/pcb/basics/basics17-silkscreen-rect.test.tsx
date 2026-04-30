import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("pcb_silkscreen_rect is converted to KiCad fp_rect inside footprint (not gr_rect)", async () => {
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
              width="2mm"
              height="1mm"
              shape="rect"
              layer="top"
            />
            <silkscreenrect
              pcbX={0}
              pcbY={0}
              width="3mm"
              height="2mm"
              layer="top"
            />
          </footprint>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]

  // Verify pcb_silkscreen_rect is in circuit JSON
  const silkscreenRects = circuitJson.filter(
    (el: any) => el.type === "pcb_silkscreen_rect",
  )
  expect(silkscreenRects.length).toBeGreaterThan(0)
  expect(silkscreenRects[0].pcb_component_id).toBeDefined()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  // The silkscreen rect should appear as fp_rect (inside footprint), NOT gr_rect (board-level)
  expect(outputString).toContain("fp_rect")
  expect(outputString).toContain("F.SilkS")

  // Confirm it's NOT at board level (gr_rect should not contain F.SilkS)
  const grRectMatches = outputString.match(/gr_rect[\s\S]*?F\.SilkS/g)
  expect(grRectMatches).toBeNull()

})
