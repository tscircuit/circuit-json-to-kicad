import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

test("a drawing-only sheet does not report a grid-placement failure", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <schematicline x1={0} y1={0} x2={1} y2={0.5} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  expect(converter.ctx.schematicConnectionGrid).toBeDefined()
  expect(converter.getOutput().polylines).toHaveLength(1)
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  await expect(
    snapshot.generatedFileContent["temp_file.png"]!,
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
