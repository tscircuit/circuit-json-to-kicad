import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

test("basics01", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board>
      <resistor name="R1" resistance="1k" footprint="0402" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)

  converter.runUntilFinished()

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutput().toString(),
    kicadFileType: "sch",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  console.log(kicadSnapshot.generatedFileContent)
  expect(kicadSnapshot.generatedFileContent).toBeDefined()

  // TODO convert into KicadSch
})
