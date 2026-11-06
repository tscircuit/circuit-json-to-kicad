import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../lib"

test("exports standalone and component-owned pcb_copper_text elements to KiCad copper layers", () => {
  const circuitJson: CircuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 120,
      height: 80,
      num_layers: 2,
      thickness: 1.6,
      material: "fr4",
    },
    {
      type: "pcb_copper_text",
      pcb_copper_text_id: "pcb_copper_text_0",
      pcb_component_id: "",
      text: "VIAGRID TOP",
      anchor_position: { x: -6.4, y: -30.8 },
      anchor_alignment: "bottom_left",
      layer: "top",
      font_size: 1.5,
      font: "tscircuit2024",
    },
    {
      type: "pcb_copper_text",
      pcb_copper_text_id: "pcb_copper_text_1",
      pcb_component_id: "",
      text: "VIAGRID BOTTOM",
      anchor_position: { x: 8.6, y: -30.8 },
      anchor_alignment: "bottom_left",
      layer: "bottom",
      font_size: 1.5,
      font: "tscircuit2024",
      is_knockout: true,
    },
    {
      type: "source_component",
      source_component_id: "source_component_0",
      name: "U1",
      ftype: "simple_chip",
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_component_0",
      source_component_id: "source_component_0",
      center: { x: 10, y: 20 },
      layer: "top",
      rotation: 0,
      width: 5,
      height: 5,
      obstructs_within_bounds: false,
    },
    {
      type: "pcb_copper_text",
      pcb_copper_text_id: "pcb_copper_text_2",
      pcb_component_id: "pcb_component_0",
      text: "PIN1_CU",
      anchor_position: { x: 11, y: 22 },
      anchor_alignment: "center",
      layer: "top",
      font_size: 1,
      font: "tscircuit2024",
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const kicadPcb = parseKicadPcb(converter.getOutputString())

  const copperGrTexts = kicadPcb.graphicTexts.filter((text) =>
    /[FB]\.Cu/.test(text.layer?.getString() ?? ""),
  )
  expect(copperGrTexts).toHaveLength(2)

  const topGrText = copperGrTexts.find((text) => text.text === "VIAGRID TOP")
  const bottomGrText = copperGrTexts.find(
    (text) => text.text === "VIAGRID BOTTOM",
  )

  expect(topGrText?.layer?.names).toEqual(["F.Cu"])
  expect(topGrText?.effects?.justify?.horizontal).toBe("left")
  expect(topGrText?.effects?.justify?.vertical).toBe("bottom")
  expect(topGrText?.effects?.justify?.mirror).toBeFalsy()

  expect(bottomGrText?.layer?.names).toEqual(["B.Cu", "knockout"])
  expect(bottomGrText?.effects?.justify?.horizontal).toBe("left")
  expect(bottomGrText?.effects?.justify?.vertical).toBe("bottom")
  expect(bottomGrText?.effects?.justify?.mirror).toBe(true)

  const footprint = kicadPcb.footprints[0]
  const copperFpText = footprint?.fpTexts.find(
    (text) => text.text === "PIN1_CU",
  )
  expect(copperFpText).toBeDefined()
  expect(copperFpText?.layer?.names).toEqual(["F.Cu"])
  expect(copperFpText?.position?.x).toBeCloseTo(1, 6)
  expect(copperFpText?.position?.y).toBeCloseTo(-2, 6)
})
