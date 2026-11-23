import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

test("overlapping generated and authored pin strokes fail schematic export", async () => {
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
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  expect(() => converter.runUntilFinished()).toThrow(
    "A pin meets multiple drawing strokes; its stem cannot move without changing the symbol body.",
  )
})
