import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const Repro31PolygonSmtpadNanCenter = () => (
  <board width="12mm" height="10mm" routingDisabled>
    <chip
      name="U1"
      pcbX={2}
      pcbY={1}
      pinLabels={{ pin1: "GND" }}
      footprint={
        <footprint>
          <smtpad
            shape="polygon"
            layer="top"
            portHints={["pin1"]}
            points={[
              { x: -1, y: -1 },
              { x: 1, y: -1 },
              { x: 1, y: 1 },
              { x: -1, y: 1 },
            ]}
          />
        </footprint>
      }
    />
  </board>
)

export default Repro31PolygonSmtpadNanCenter

test("pcb repro31 falls back to polygon vertices for invalid pad centers", async () => {
  const circuit = new Circuit()
  circuit.add(<Repro31PolygonSmtpadNanCenter />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const pointsOnlyCircuitJson = structuredClone(circuitJson)
  const pad = circuitJson.find(
    (element) => element.type === "pcb_smtpad" && element.shape === "polygon",
  )
  if (pad?.type !== "pcb_smtpad" || pad.shape !== "polygon") {
    throw new Error("Missing polygon SMT pad in the rendered TSX fixture")
  }

  // Older circuit-json-util transforms added these fields to points-only
  // pads. Preserve that input case even after the upstream bug is fixed.
  Object.assign(pad, { x: Number.NaN, y: Number.NaN })
  expect(
    pad.points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)),
  ).toBe(true)
  expect(pad).toHaveProperty("x", Number.NaN)
  expect(pad).toHaveProperty("y", Number.NaN)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const invalidCoordinateLines = output
    .split("\n")
    .filter((line) => line.includes("NaN") || line.includes("undefined"))

  expect(invalidCoordinateLines).toEqual([])

  const pointsOnlyConverter = new CircuitJsonToKicadPcbConverter(
    pointsOnlyCircuitJson,
  )
  pointsOnlyConverter.runUntilFinished()
  expect(output).toBe(pointsOnlyConverter.getOutputString())

  // Downloaded Circuit JSON contains null instead of the in-memory NaN.
  // Both forms must preserve the same pad position and polygon geometry.
  const serializedConverter = new CircuitJsonToKicadPcbConverter(
    JSON.parse(JSON.stringify(circuitJson)),
  )
  serializedConverter.runUntilFinished()
  expect(serializedConverter.getOutputString()).toBe(output)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson: pointsOnlyCircuitJson,
        outputType: "pcb",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
