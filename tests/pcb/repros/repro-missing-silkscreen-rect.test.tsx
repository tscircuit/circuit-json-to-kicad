import { beforeAll, expect, test } from "bun:test"
import type { CircuitJson, PcbSilkscreenRect } from "circuit-json"
import type { Footprint } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

let circuitJson: CircuitJson
let footprint: Footprint
let kicadPcbString: string

beforeAll(async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm" routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-5} />
    </board>,
  )
  await circuit.renderUntilSettled()
  circuitJson = circuit.getCircuitJson()

  const component = circuitJson.find(
    (element) => element.type === "pcb_component",
  )!
  const silkscreenRect: PcbSilkscreenRect = {
    type: "pcb_silkscreen_rect",
    pcb_silkscreen_rect_id: "silkscreen_rect_1",
    pcb_component_id: component.pcb_component_id,
    center: { x: 4, y: 0 },
    width: 3,
    height: 2,
    layer: "top",
    stroke_width: 0.2,
  }
  circuitJson.push(silkscreenRect)
  circuitJson.push({
    type: "pcb_silkscreen_rect",
    pcb_silkscreen_rect_id: "silkscreen_rect_2",
    pcb_component_id: component.pcb_component_id,
    center: { x: 4, y: -5 },
    width: 3,
    height: 2,
    layer: "bottom",
    stroke_width: 0.2,
    corner_radius: 0.4,
    ccw_rotation: 30,
    has_stroke: false,
    is_filled: true,
  })

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  footprint = converter.getOutput().footprints[0]!
  kicadPcbString = converter.getOutputString()
})

test("real board contains a component silkscreen rectangle", () => {
  expect(circuitJson.some((element) => element.type === "pcb_board")).toBe(true)
  expect(
    circuitJson.some((element) => element.type === "pcb_silkscreen_rect"),
  ).toBe(true)
})

test("component silkscreen rectangle is exported on F.SilkS", () => {
  expect(
    footprint.fpPolys.some(
      (poly) => poly.layer?.getString() === "(layer F.SilkS)",
    ),
  ).toBe(true)
  const bottomRect = footprint.fpPolys.find(
    (poly) => poly.layer?.getString() === "(layer B.SilkS)",
  )
  expect(bottomRect?.fill?.filled).toBe(true)
  expect(bottomRect?.stroke).toBeUndefined()
  expect(bottomRect?.points?.points.length).toBeGreaterThan(4)
})

test(
  "silkscreen rectangle board snapshot",
  async () => {
    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: kicadPcbString,
      kicadFileType: "pcb",
    })
    expect(kicadSnapshot.exitCode).toBe(0)
    expect(
      await stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 120000 },
)
