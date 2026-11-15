import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

test("anchors an intentional NC on the custom symbol's exported pin", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={20} height={20} routingDisabled>
      <chip
        name="U1"
        footprint="soic8"
        schX={2}
        schY={1}
        pinLabels={{ pin1: "IN", pin2: "NC" }}
        noConnect={["NC"]}
        symbol={
          <symbol>
            <schematicrect width={2} height={2} />
            <schematicline x1={-2.5} y1={0} x2={-1} y2={0} />
            <schematicline x1={1} y1={0} x2={2.5} y2={0} />
            <port
              name="IN"
              pinNumber={1}
              direction="left"
              schX={-2.5}
              schY={0}
            />
            <port
              name="NC"
              pinNumber={2}
              direction="right"
              schX={2.5}
              schY={0}
            />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const markedPorts = circuitJson.filter(
    (element) => element.type === "source_port" && element.do_not_connect,
  )
  expect(markedPorts).toHaveLength(1)
  expect(markedPorts[0]).toMatchObject({ pin_number: 2 })

  const converter = new CircuitJsonToKicadSchConverter(circuitJson, {
    schematicSheets: [{ circuitOrigin: { x: 100, y: 100 } }],
  })
  converter.runUntilFinished()
  const output = parseKicadSch(converter.getOutputString())
  expect(output.noConnects).toHaveLength(1)
  const marker = output.noConnects[0]!
  expect(marker.at!.x).toBeCloseTo(137.5)
  expect(marker.at!.y).toBeCloseTo(100)
  const symbol = output.symbols[0]!
  const ncPin = output
    .libSymbols!.symbols.find(
      (librarySymbol) => librarySymbol.libraryId === symbol.libraryId,
    )!
    .subSymbols.flatMap((subSymbol) => subSymbol.pins)
    .find((pin) => pin.numberString === "2")!
  expect(symbol.at!.x + ncPin.at!.x).toBeCloseTo(marker.at!.x)
  expect(symbol.at!.y - ncPin.at!.y).toBeCloseTo(marker.at!.y)
})
