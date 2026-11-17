import { beforeAll, expect, test } from "bun:test"
import type { CircuitJson, PcbSmtPad } from "circuit-json"
import type { Footprint } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

const BottomTestPadBoard = () => (
  <board width="20mm" height="12mm" routingDisabled>
    <resistor name="R1" resistance="1k" footprint="0402" pcbX={-4} />
    <smtpad
      shape="rect"
      width="1mm"
      height="1mm"
      pcbX={4}
      pcbY={0}
      layer="bottom"
    />
  </board>
)

let circuitJson: CircuitJson
let standaloneFootprint: Footprint | undefined

beforeAll(async () => {
  const circuit = new Circuit()
  circuit.add(<BottomTestPadBoard />)
  await circuit.renderUntilSettled()
  circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  standaloneFootprint = converter
    .getOutput()
    .footprints.find((footprint) =>
      footprint.libraryLink?.startsWith("tscircuit:smtpad_"),
    )
})

test("real board contains a standalone bottom SMT pad exported on B.Cu", () => {
  const standalonePads = circuitJson.filter(
    (element): element is PcbSmtPad =>
      element.type === "pcb_smtpad" && !element.pcb_component_id,
  )
  expect(standalonePads).toHaveLength(1)
  expect(standalonePads[0]?.layer).toBe("bottom")
  expect(standaloneFootprint).toBeDefined()
  expect(standaloneFootprint?.fpPads[0]?.getString()).toContain(
    "(layers B.Cu B.Paste B.Mask)",
  )
})

test.failing("standalone bottom SMT pad is placed in a B.Cu footprint", () => {
  expect(standaloneFootprint?.layer?.getString()).toBe("(layer B.Cu)")
})
