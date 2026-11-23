import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"

test("overlapping pin strokes follow the pin and retain the connected net", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip
        name="D1"
        schX={0.3}
        symbol={
          <symbol>
            <schematicpath
              points={[
                { x: 0.13, y: 0.8 },
                { x: 0.54, y: 0.8 },
              ]}
            />
            <schematicpath
              points={[
                { x: 0.13, y: 0.4 },
                { x: 0.13, y: 1.2 },
              ]}
            />
            <port
              name="pin1"
              pinNumber={1}
              direction="right"
              schX={0.54}
              schY={0.8}
              schStemLength={0.3}
            />
          </symbol>
        }
      />
      <resistor name="R1" resistance="1k" schX={3} />
      <trace from=".D1 > .pin1" to=".R1 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()

  // NEMA17 Wago v1.0.1's D_STATUS has the same overlap on its cathode pins.
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const definition = converter
    .getOutput()
    .libSymbols!.symbols.find((symbol) =>
      symbol.libraryId?.startsWith("Custom:"),
    )!
  const [stem, drawnLead, body] = definition.subSymbols.flatMap(
    (unit) => unit.polylines,
  )
  const [pin] = definition.subSymbols.flatMap((unit) => unit.pins)
  const pinTip = { x: pin!.at!.x, y: pin!.at!.y }
  const join = { x: -1.425, y: 0 }
  const bodyContact = { x: -3.075, y: 0 }
  expect(stem!.points!.points).toMatchObject([pinTip, join])
  expect(drawnLead!.points!.points).toMatchObject([bodyContact, join, pinTip])
  expect(body!.points!.points).toMatchObject([
    { x: bodyContact.x, y: -6 },
    { x: bodyContact.x, y: 6 },
  ])

  const nets = await exportNativeSchematicNets(circuitJson)
  expect(nets.map((net) => net.pins)).toContainEqual(["D1.1", "R1.1"])
})
