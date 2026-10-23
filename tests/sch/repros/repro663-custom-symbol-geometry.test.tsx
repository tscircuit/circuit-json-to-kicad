import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { parseKicadSch } from "kicadts"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"

const Box = ({ halfWidth }: { halfWidth: number }) => (
  <symbol name="Shared">
    <schematicpath
      points={[
        { x: -halfWidth, y: -0.4 },
        { x: halfWidth, y: -0.4 },
        { x: halfWidth, y: 0.4 },
        { x: -halfWidth, y: 0.4 },
        { x: -halfWidth, y: -0.4 },
      ]}
      strokeWidth={0.05}
    />
    <port name="1" pinNumber={1} direction="right" schX={halfWidth} schY={0} />
  </symbol>
)

test.failing("repro663: same-name custom symbols preserve each geometry and connection", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="40mm" height="40mm" routingDisabled>
      {[1, 2, 1].map((halfWidth, index) => (
        <group key={index}>
          <chip
            name={`A${index + 1}`}
            footprint={
              <footprint>
                <smtpad
                  shape="rect"
                  width={1}
                  height={1}
                  portHints={["1"]}
                  pcbX={0}
                  pcbY={0}
                />
              </footprint>
            }
            symbol={<Box halfWidth={halfWidth} />}
            schX={0}
            schY={-3 * index}
          />
          <resistor
            name={`R${index + 1}`}
            resistance="1k"
            footprint="0402"
            schX={6}
            schY={-3 * index}
          />
          <trace
            from={`.A${index + 1} > .pin1`}
            to={`.R${index + 1} > .pin1`}
          />
        </group>
      ))}
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  await Bun.write("debug-output/repro663.kicad_sch", output)
  const schematic = parseKicadSch(output)
  const ids = ["A1", "A2", "A3"].map(
    (reference) =>
      schematic.symbols.find((symbol) =>
        symbol.properties.some(
          (property) =>
            property.key === "Reference" && property.value === reference,
        ),
      )!.libraryId,
  )
  expect(ids[0]).not.toBe(ids[1])
  expect(ids[2]).toBe(ids[0])
  expect(
    schematic.libSymbols!.symbols.filter((symbol) =>
      symbol.libraryId?.startsWith("Custom:Shared"),
    ),
  ).toHaveLength(2)
  const nativeNets = await exportNativeSchematicNets(circuitJson)
  for (const index of [1, 2, 3]) {
    expect(nativeNets).toContainEqual({
      name: `Net-(A${index}-Pad1)`,
      pins: [`A${index}.1`, `R${index}.1`],
    })
  }
}, 30_000)
