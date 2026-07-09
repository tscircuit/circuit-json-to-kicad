import { expect, test } from "bun:test"
import type { PcbSilkscreenText } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { KicadPcb } from "kicadts"
import { Circuit } from "tscircuit"

test("pcb repro26 bottom-layer silkscreen text gets justify mirror", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={0} pcbY={0} />
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]
  const pcbComponent = circuitJson.find(
    (entry) => entry.type === "pcb_component",
  )

  expect(pcbComponent).toBeDefined()

  const standaloneBottomText: PcbSilkscreenText = {
    type: "pcb_silkscreen_text",
    pcb_silkscreen_text_id: "repro26_bottom_board_text",
    pcb_component_id: "",
    font: "tscircuit2024",
    font_size: 1,
    text: "BOTTOM BOARD TEXT",
    layer: "bottom",
    anchor_position: { x: -4, y: 5 },
    anchor_alignment: "center",
  }

  const standaloneExplicitMirrorText: PcbSilkscreenText = {
    type: "pcb_silkscreen_text",
    pcb_silkscreen_text_id: "repro26_top_explicit_mirror_text",
    pcb_component_id: "",
    font: "tscircuit2024",
    font_size: 1,
    text: "TOP MIRRORED TEXT",
    layer: "top",
    is_mirrored: true,
    anchor_position: { x: 4, y: 5 },
    anchor_alignment: "center",
  }

  const footprintBottomText: PcbSilkscreenText = {
    type: "pcb_silkscreen_text",
    pcb_silkscreen_text_id: "repro26_bottom_footprint_text",
    pcb_component_id: pcbComponent!.pcb_component_id,
    font: "tscircuit2024",
    font_size: 1,
    text: "BOTTOM FOOTPRINT TEXT",
    layer: "bottom",
    anchor_position: {
      x: pcbComponent!.center.x + 1,
      y: pcbComponent!.center.y + 1,
    },
    anchor_alignment: "top_left",
  }

  circuitJson.push(
    standaloneBottomText,
    standaloneExplicitMirrorText,
    footprintBottomText,
  )

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()
  const kicadPcb = KicadPcb.parse(outputString)[0] as KicadPcb

  const bottomBoardText = kicadPcb.graphicTexts.find(
    (text) => text.text === "BOTTOM BOARD TEXT",
  )
  expect(bottomBoardText?.layer?.getString()).toContain("B.SilkS")
  expect(bottomBoardText?.effects?.justify?.mirror).toBe(true)
  expect(bottomBoardText?.effects?.justify?.horizontal).toBeUndefined()
  expect(bottomBoardText?.effects?.justify?.vertical).toBeUndefined()

  const explicitMirrorText = kicadPcb.graphicTexts.find(
    (text) => text.text === "TOP MIRRORED TEXT",
  )
  expect(explicitMirrorText?.layer?.getString()).toContain("F.SilkS")
  expect(explicitMirrorText?.effects?.justify?.mirror).toBe(true)

  const footprint = kicadPcb.footprints[0]
  expect(footprint).toBeDefined()

  const bottomFootprintText = footprint?.fpTexts.find(
    (text) => text.text === "BOTTOM FOOTPRINT TEXT",
  )
  expect(bottomFootprintText?.layer?.getString()).toContain("B.SilkS")
  expect(bottomFootprintText?.effects?.justify?.mirror).toBe(true)
  expect(bottomFootprintText?.effects?.justify?.horizontal).toBe("left")
  expect(bottomFootprintText?.effects?.justify?.vertical).toBe("top")
})
