import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

test("resolves symbol-scoped NC pins separately for instances sharing a library", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={30} height={20} routingDisabled>
      {[
        { name: "U1", x: 0, noConnect: ["NC"] },
        { name: "U2", x: 4, noConnect: ["IN"] },
      ].map(({ name, x, noConnect }) => (
        <chip
          key={name}
          name={name}
          footprint="soic8"
          schX={x}
          pinLabels={{ pin1: "IN", pin2: "NC" }}
          noConnect={noConnect}
          symbol={
            <symbol name="SharedNC">
              <schematicrect width={2} height={2} />
              <port name="IN" pinNumber={1} schX={-2.5} schY={0} />
              <port name="NC" pinNumber={2} schX={2.5} schY={0} />
            </symbol>
          }
        />
      ))}
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const components = circuitJson.filter(
    (element) => element.type === "schematic_component",
  )
  for (const component of components) {
    const primitive = circuitJson.find(
      (element) =>
        element.type === "schematic_rect" &&
        element.schematic_component_id === component.schematic_component_id,
    )!
    const symbolId = Reflect.get(primitive, "schematic_symbol_id")
    expect(symbolId).toBeString()
    Reflect.set(component, "schematic_symbol_id", symbolId)
    // Exercise the symbol-only port linkage accepted by custom-symbol02/03.
    for (const port of circuitJson) {
      if (
        port.type === "schematic_port" &&
        port.schematic_component_id === component.schematic_component_id
      ) {
        Reflect.set(port, "schematic_symbol_id", symbolId)
        Reflect.deleteProperty(port, "schematic_component_id")
      }
    }
  }

  const converter = new CircuitJsonToKicadSchConverter(circuitJson, {
    schematicSheets: [{ circuitOrigin: { x: 100, y: 100 } }],
  })
  converter.runUntilFinished()
  const output = parseKicadSch(converter.getOutputString())
  expect(output.libSymbols!.symbols).toHaveLength(1)
  expect(output.symbols).toHaveLength(2)
  expect(
    output.noConnects.map((marker) => [marker.at!.x, marker.at!.y]),
  ).toEqual([
    [84.25, 98.5],
    [144.25, 95.5],
  ])
})
