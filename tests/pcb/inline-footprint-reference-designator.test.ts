import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

const createCircuitJson = (silkscreenReferenceText?: string): any[] => [
  {
    type: "source_component",
    source_component_id: "sc1",
    name: "J1",
    ftype: "simple_chip",
  },
  {
    type: "source_port",
    source_port_id: "sp1",
    source_component_id: "sc1",
    name: "pin1",
    pin_number: 1,
  },
  {
    type: "source_port",
    source_port_id: "sp2",
    source_component_id: "sc1",
    name: "pin2",
    pin_number: 2,
  },
  {
    type: "pcb_component",
    pcb_component_id: "pc1",
    source_component_id: "sc1",
    center: { x: 0, y: 0 },
    width: 2,
    height: 1.2,
    layer: "top",
    rotation: 0,
  },
  {
    type: "pcb_port",
    pcb_port_id: "pp1",
    source_port_id: "sp1",
    pcb_component_id: "pc1",
    x: -0.5,
    y: 0,
    layers: ["top"],
  },
  {
    type: "pcb_port",
    pcb_port_id: "pp2",
    source_port_id: "sp2",
    pcb_component_id: "pc1",
    x: 0.5,
    y: 0,
    layers: ["top"],
  },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: "pad1",
    pcb_component_id: "pc1",
    pcb_port_id: "pp1",
    shape: "rect",
    x: -0.5,
    y: 0,
    width: 0.55,
    height: 1.1,
    layer: "top",
    port_hints: ["pin1"],
  },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: "pad2",
    pcb_component_id: "pc1",
    pcb_port_id: "pp2",
    shape: "rect",
    x: 0.5,
    y: 0,
    width: 0.55,
    height: 1.1,
    layer: "top",
    port_hints: ["pin2"],
  },
  {
    type: "pcb_board",
    pcb_board_id: "b1",
    center: { x: 0, y: 0 },
    width: 10,
    height: 10,
    thickness: 1.4,
    num_layers: 2,
    material: "fr4",
  },
  ...(silkscreenReferenceText
    ? [
        {
          type: "pcb_silkscreen_text",
          pcb_silkscreen_text_id: "st1",
          pcb_component_id: "pc1",
          text: silkscreenReferenceText,
          anchor_position: { x: 0, y: -1.5 },
          anchor_alignment: "center",
          font: "tscircuit2024",
          font_size: 0.5,
          layer: "top",
        },
      ]
    : []),
]

const getReferenceProperty = (circuitJson: any[]) => {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const start = output.indexOf('(property "Reference" "J1"')
  expect(start).toBeGreaterThan(-1)
  return {
    output,
    block: output.slice(start, output.indexOf("(uuid", start)),
  }
}

test("inline footprint without silkscreen text keeps a visible reference designator", () => {
  const { block, output } = getReferenceProperty(createCircuitJson())

  expect(block).toContain("(layer F.SilkS)")
  expect(block).not.toContain("(hide yes)")
  expect(output).not.toMatch(/\(fp_text\s+reference/)
})

test("footprint with a reference silkscreen text keeps the Reference property hidden", () => {
  const { block, output } = getReferenceProperty(createCircuitJson("J1"))

  expect(block).toContain("(hide yes)")
  expect(output).toMatch(/\(fp_text\s+reference/)
})
