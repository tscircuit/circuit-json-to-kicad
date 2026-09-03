import { expect, test } from "bun:test"
import { transformPCBElement } from "@tscircuit/circuit-json-util"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { identity } from "transformation-matrix"
import { Circuit } from "tscircuit"

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

test("pcb repro31 exports NaN coordinates for a polygon SMT pad", async () => {
  const circuit = new Circuit()
  circuit.add(<Repro31PolygonSmtpadNanCenter />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const pad = circuitJson.find(
    (element) => element.type === "pcb_smtpad" && element.shape === "polygon",
  )
  if (pad?.type !== "pcb_smtpad" || pad.shape !== "polygon") {
    throw new Error("Missing polygon SMT pad in the rendered TSX fixture")
  }

  // Reproduce circuit-json-util#122 through a real transform, without
  // injecting NaN or constructing Circuit JSON records. Keep the result
  // in memory because JSON serialization turns NaN into null.
  transformPCBElement(pad, identity())
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

  // Match the repro-only approach in merged PR #312. A native KiCad
  // snapshot cannot be generated until these invalid coordinates are fixed.
  // kicadts accepts NaN pad positions, so its parser cannot catch this case.
  expect(invalidCoordinateLines.map((line) => line.trim())).toEqual([
    "(at NaN NaN 0)",
    "(xy NaN NaN)",
    "(xy NaN NaN)",
    "(xy NaN NaN)",
    "(xy NaN NaN)",
  ])
})
