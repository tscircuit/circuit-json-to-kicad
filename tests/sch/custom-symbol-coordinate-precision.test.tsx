import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { Fragment } from "react"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"

test("fractional pin positions connect on every side and at KiCad rounding boundaries", async () => {
  // One KiCad schematic unit is 0.0001 mm; the converter scales by 15.
  const unit = 0.0001 / 15
  const pins = [
    { x: 2 / 7, y: 0, direction: "right", centerX: 0.1234567 },
    { x: 2 / 7 + unit, y: 0, direction: "right", centerX: 0.1234567 },
    { x: -2 / 7, y: 0, direction: "left", centerX: 0.1234567 },
    { x: 0, y: 2 / 7, direction: "up", centerX: 0.1234567 },
    { x: 0, y: -2 / 7, direction: "down", centerX: 0.1234567 },
    // Half-unit ties expose differences between rounding local and sheet positions.
    { x: 1 + unit / 2, y: 0, direction: "right", centerX: 1.3 },
    { x: 1 + 16.5 * unit, y: 0, direction: "right", centerX: 1.3 },
    { x: 1 + 17.5 * unit, y: 0, direction: "right", centerX: 3.1 },
  ] as const
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      {pins.map((pin, index) => (
        <Fragment key={index}>
          <chip
            name={`U${index + 1}`}
            schX={pin.centerX}
            schY={-3.1234567 * index}
            symbol={
              <symbol name="Shared">
                <schematicrect width={0.4} height={0.4} />
                <port
                  name="1"
                  pinNumber={1}
                  direction={pin.direction}
                  schX={pin.x}
                  schY={pin.y}
                />
              </symbol>
            }
          />
          <resistor
            name={`R${index + 1}`}
            resistance="1k"
            schX={6}
            schY={-3.1234567 * index}
          />
          <trace
            from={`.U${index + 1} > .pin1`}
            to={`.R${index + 1} > .pin1`}
          />
        </Fragment>
      ))}
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const options = { schematicSheets: [{ circuitOrigin: { x: 100, y: 100 } }] }
  const converter = new CircuitJsonToKicadSchConverter(circuitJson, options)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  const ids = schematic.symbols
    .filter((symbol) =>
      symbol.properties.some(
        (property) =>
          property.key === "Reference" && property.value.startsWith("U"),
      ),
    )
    .map((symbol) => symbol.libraryId)
  // Even the two positions only one native unit apart must remain distinct.
  expect(new Set(ids.slice(0, 5)).size).toBe(5)

  const nets = await exportNativeSchematicNets(circuitJson, options)
  for (let index = 1; index <= pins.length; index++) {
    expect(nets.map((net) => net.pins)).toContainEqual([
      `R${index}.1`,
      `U${index}.1`,
    ])
  }
}, 30_000)
