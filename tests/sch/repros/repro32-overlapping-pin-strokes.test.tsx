import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"

test("overlapping pin strokes follow the pin and retain the connected net", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        schX={0.3}
        symbol={
          <symbol>
            <schematicrect width={1.2} height={0.9} strokeWidth={0.02} />
            <schematictext text="{REF}" schX={0} schY={0} fontSize={0.22} />
            <schematicpath
              points={[
                { x: 0.6, y: 0.15 },
                { x: 1.05, y: 0.15 },
              ]}
            />
            <port
              name="pin1"
              pinNumber={1}
              direction="right"
              schX={1.05}
              schY={0.15}
              schStemLength={0.3}
            />
          </symbol>
        }
      />
      <resistor name="R1" resistance="1k" schX={3.4} schY={0.15} />
      <trace from=".U1 > .pin1" to=".R1 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()

  // NEMA17 Wago v1.0.1's D_STATUS has the same overlap on its cathode pins.
  const circuitJson = circuit.getCircuitJson()
  const sourceSnapshot = await takeCircuitJsonSnapshot({
    circuitJson,
    outputType: "schematic",
  })
  await expect(sourceSnapshot).toMatchPngSnapshot(import.meta.path)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const definition = converter
    .getOutput()
    .libSymbols!.symbols.find((symbol) =>
      symbol.libraryId?.startsWith("Custom:"),
    )!
  const [stem, drawnLead] = definition.subSymbols.flatMap(
    (unit) => unit.polylines,
  )
  const [body] = definition.subSymbols.flatMap((unit) => unit.rectangles)
  const [pin] = definition.subSymbols.flatMap((unit) => unit.pins)
  const pinTip = { x: pin!.at!.x, y: pin!.at!.y }
  const join = { x: 7.875, y: 2.25 }
  const bodyContact = { x: 5.625, y: 2.25 }
  expect(stem!.points!.points).toMatchObject([pinTip, join])
  expect(drawnLead!.points!.points).toMatchObject([bodyContact, join, pinTip])
  expect(body!.getString()).toContain("(start -12.375 -6.75)")
  expect(body!.getString()).toContain("(end 5.625 6.75)")

  const nets = await exportNativeSchematicNets(circuitJson)
  expect(nets.map((net) => net.pins)).toContainEqual(["R1.1", "U1.1"])
})
