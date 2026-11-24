import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib"
import { Circuit } from "tscircuit"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"

import { PanelClippingRepro } from "./assets/panel-clipping-repro"

export default PanelClippingRepro

test("2x2 panel cutouts do not crash polygon clipping", async () => {
  const conversionErrors = []
  for (const rounded of [false, true]) {
    const circuit = new Circuit()
    circuit.add(<PanelClippingRepro rounded={rounded} />)
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()
    await expect(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
    ).toMatchPngSnapshot(
      import.meta.path,
      rounded ? "panel-clipping-rounded" : "panel-clipping-square",
    )
    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    let output: string | undefined
    try {
      converter.runUntilFinished()
      output = converter.getOutputString()
    } catch (error) {
      conversionErrors.push({ rounded, error: String(error) })
    }
    if (output) expect(output).toMatch(/\(layer "?Edge\.Cuts"?\)/)
  }
  expect(conversionErrors).toEqual([])
})
