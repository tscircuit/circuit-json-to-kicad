import { expect, test } from "bun:test"
import "bun-match-svg"
import type { CircuitJson } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { CircuitJsonToKicadPcbConverter } from "../../lib"

const createBaseCircuitJson = (): CircuitJson => [
  {
    type: "pcb_board",
    pcb_board_id: "pcb_board_0",
    center: { x: 0, y: 0 },
    width: 12,
    height: 10,
    thickness: 1.6,
    num_layers: 2,
    material: "fr4",
  },
  {
    type: "source_component",
    source_component_id: "source_component_0",
    name: "U3",
    ftype: "simple_chip",
  },
  {
    type: "pcb_component",
    pcb_component_id: "pcb_component_0",
    source_component_id: "source_component_0",
    center: { x: 0, y: 0 },
    width: 3,
    height: 3,
    rotation: 0,
    layer: "top",
    obstructs_within_bounds: true,
  },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: "pcb_smtpad_1",
    pcb_component_id: "pcb_component_0",
    layer: "top",
    shape: "rect",
    x: -1.45,
    y: 0.8,
    width: 0.8,
    height: 0.3,
    port_hints: ["1"],
  },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: "pcb_smtpad_2",
    pcb_component_id: "pcb_component_0",
    layer: "top",
    shape: "rect",
    x: -1.45,
    y: -0.8,
    width: 0.8,
    height: 0.3,
    port_hints: ["2"],
  },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: "pcb_smtpad_3",
    pcb_component_id: "pcb_component_0",
    layer: "top",
    shape: "rect",
    x: 1.45,
    y: -0.8,
    width: 0.8,
    height: 0.3,
    port_hints: ["3"],
  },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: "pcb_smtpad_4",
    pcb_component_id: "pcb_component_0",
    layer: "top",
    shape: "rect",
    x: 1.45,
    y: 0.8,
    width: 0.8,
    height: 0.3,
    port_hints: ["4"],
  },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: "pcb_smtpad_11",
    pcb_component_id: "pcb_component_0",
    layer: "top",
    shape: "polygon",
    port_hints: ["11"],
    points: [
      { x: -0.8, y: -1.1 },
      { x: 0.8, y: -1.1 },
      { x: 0.8, y: 0.7 },
      { x: 0.5, y: 1.1 },
      { x: -0.8, y: 1.1 },
    ],
  },
]

test("derives polygon pad center from vertices when optional x/y are NaN or null (#290)", async () => {
  const controlCircuitJson = createBaseCircuitJson()
  const nanCircuitJson = createBaseCircuitJson()
  const nanPolygonPad = nanCircuitJson.find(
    (el) => el.type === "pcb_smtpad" && el.pcb_smtpad_id === "pcb_smtpad_11",
  ) as any
  nanPolygonPad.x = Number.NaN
  nanPolygonPad.y = Number.NaN

  const nullCircuitJson = JSON.parse(
    JSON.stringify(nanCircuitJson),
  ) as CircuitJson

  const controlConverter = new CircuitJsonToKicadPcbConverter(
    controlCircuitJson,
  )
  controlConverter.runUntilFinished()
  const controlOutput = controlConverter.getOutputString()

  const nanConverter = new CircuitJsonToKicadPcbConverter(nanCircuitJson)
  nanConverter.runUntilFinished()
  const nanOutput = nanConverter.getOutputString()

  const nullConverter = new CircuitJsonToKicadPcbConverter(nullCircuitJson)
  nullConverter.runUntilFinished()
  const nullOutput = nullConverter.getOutputString()

  expect(nanOutput).not.toContain("NaN")
  expect(nullOutput).not.toContain("NaN")
  expect(nullOutput).not.toContain("null")
  expect(nanOutput).toBe(controlOutput)
  expect(nullOutput).toBe(controlOutput)

  const footprint = nanConverter.getOutput().footprints[0]
  const pad11 = footprint?.fpPads.find((p) => p.number === "11")
  expect(pad11).toBeDefined()
  expect(pad11?.shape).toBe("custom")
  expect(Number.isFinite(pad11?.at?.x)).toBe(true)
  expect(Number.isFinite(pad11?.at?.y)).toBe(true)

  const pcbSvg = convertCircuitJsonToPcbSvg(controlCircuitJson)
  expect(pcbSvg).toMatchSvgSnapshot(import.meta.path)
})
