import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"

const SquareWithPin = ({
  x = 0,
  y = 0,
  direction,
}: {
  x?: number
  y?: number
  direction: "left" | "right" | "up" | "down"
}) => (
  <symbol name="Shared">
    <schematicrect width={0.4} height={0.4} />
    <port name="1" pinNumber={1} direction={direction} schX={x} schY={y} />
  </symbol>
)

// Fractional placements exercise rounding of both the symbol origin and its pin.
const rowSpacing = 3.1234567
// One KiCad schematic unit is 0.0001 mm; the converter scales by 15.
const unit = 0.0001 / 15

const Example = () => (
  <board>
    <chip
      name="U1"
      schX={0.1234567}
      symbol={<SquareWithPin x={2 / 7} direction="right" />}
    />
    <resistor name="R1" resistance="1k" schX={6} />
    <trace from=".U1 > .pin1" to=".R1 > .pin1" />

    <chip
      name="U2"
      schX={0.1234567}
      schY={-rowSpacing}
      symbol={<SquareWithPin x={2 / 7 + unit} direction="right" />}
    />
    <resistor name="R2" resistance="1k" schX={6} schY={-rowSpacing} />
    <trace from=".U2 > .pin1" to=".R2 > .pin1" />

    <chip
      name="U3"
      schX={0.1234567}
      schY={-2 * rowSpacing}
      symbol={<SquareWithPin x={-2 / 7} direction="left" />}
    />
    <resistor name="R3" resistance="1k" schX={6} schY={-2 * rowSpacing} />
    <trace from=".U3 > .pin1" to=".R3 > .pin1" />

    <chip
      name="U4"
      schX={0.1234567}
      schY={-3 * rowSpacing}
      symbol={<SquareWithPin y={2 / 7} direction="up" />}
    />
    <resistor name="R4" resistance="1k" schX={6} schY={-3 * rowSpacing} />
    <trace from=".U4 > .pin1" to=".R4 > .pin1" />

    <chip
      name="U5"
      schX={0.1234567}
      schY={-4 * rowSpacing}
      symbol={<SquareWithPin y={-2 / 7} direction="down" />}
    />
    <resistor name="R5" resistance="1k" schX={6} schY={-4 * rowSpacing} />
    <trace from=".U5 > .pin1" to=".R5 > .pin1" />

    <chip
      name="U6"
      schX={1.3}
      schY={-5 * rowSpacing}
      symbol={<SquareWithPin x={1 + unit / 2} direction="right" />}
    />
    <resistor name="R6" resistance="1k" schX={6} schY={-5 * rowSpacing} />
    <trace from=".U6 > .pin1" to=".R6 > .pin1" />
  </board>
)

export default Example

test("fractional pins connect on every side and at a half-unit rounding boundary", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(<Example />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const options = { schematicSheets: [{ circuitOrigin: { x: 100, y: 100 } }] }
  const converter = new CircuitJsonToKicadSchConverter(circuitJson, options)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  const ids = schematic.symbols
    .filter((symbol) => symbol.libraryId?.startsWith("Custom:Shared"))
    .map((symbol) => symbol.libraryId)
  // U1 and U2 differ by just one native coordinate unit; neither may be merged.
  expect(new Set(ids.slice(0, 5)).size).toBe(5)

  const connections = (
    await exportNativeSchematicNets(circuitJson, options)
  ).map((net) => net.pins)
  expect(connections).toContainEqual(["R1.1", "U1.1"])
  expect(connections).toContainEqual(["R2.1", "U2.1"])
  expect(connections).toContainEqual(["R3.1", "U3.1"])
  expect(connections).toContainEqual(["R4.1", "U4.1"])
  expect(connections).toContainEqual(["R5.1", "U5.1"])
  expect(connections).toContainEqual(["R6.1", "U6.1"])
}, 30_000)
