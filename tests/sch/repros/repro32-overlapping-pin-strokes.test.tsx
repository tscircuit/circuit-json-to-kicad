import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"

test("overlapping generated and authored pin strokes fail schematic export", async () => {
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
  expect(() => converter.runUntilFinished()).toThrow(
    "A pin meets multiple drawing strokes; its stem cannot move without changing the symbol body.",
  )
})
