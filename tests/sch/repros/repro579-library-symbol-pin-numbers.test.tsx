import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

function getPinMappings(kicadSchematic: string) {
  return Object.fromEntries(
    Array.from(
      kicadSchematic.matchAll(
        /\(pin passive line[\s\S]*?\(name "([^"]+)"[\s\S]*?\(number "([^"]+)"/g,
      ),
      ([, name, number]) => [name, number],
    ),
  )
}

test("repro579: library symbol pin numbers match circuit pin labels", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="20mm" height="20mm">
      <crystal
        name="X1"
        frequency="8MHz"
        loadCapacitance="20pF"
        pinVariant="four_pin"
        pcbX={0}
        pcbY={0}
        footprint={
          <footprint>
            <smtpad
              portHints={["1"]}
              pcbX={-1}
              pcbY={-1}
              width={0.8}
              height={0.8}
              shape="rect"
              layer="top"
            />
            <smtpad
              portHints={["2"]}
              pcbX={-1}
              pcbY={1}
              width={0.8}
              height={0.8}
              shape="rect"
              layer="top"
            />
            <smtpad
              portHints={["3"]}
              pcbX={1}
              pcbY={-1}
              width={0.8}
              height={0.8}
              shape="rect"
              layer="top"
            />
            <smtpad
              portHints={["4"]}
              pcbX={1}
              pcbY={1}
              width={0.8}
              height={0.8}
              shape="rect"
              layer="top"
            />
          </footprint>
        }
      />
      <net name="OSC_IN" />
      <net name="OSC_OUT" />
      <net name="GND" />
      <trace from="X1.pin1" to="net.OSC_IN" />
      <trace from="X1.pin3" to="net.OSC_OUT" />
      <trace from="X1.pin2" to="net.GND" />
      <trace from="X1.pin4" to="net.GND" />
    </board>,
  )

  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  expect(getPinMappings(converter.getOutputString())).toEqual({
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
  })
})

test("repro579: pin numbers come from circuit ports, not numeric symbol labels", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <led name="D1" color="red" footprint="0603" />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson() as any[]
  const component = circuitJson.find(
    (element) => element.type === "schematic_component",
  )
  const ports = circuitJson.filter(
    (element) =>
      element.type === "schematic_port" &&
      element.schematic_component_id === component.schematic_component_id,
  )
  ;[ports[0].center, ports[1].center] = [ports[1].center, ports[0].center]
  ;[ports[0].facing_direction, ports[1].facing_direction] = [
    ports[1].facing_direction,
    ports[0].facing_direction,
  ]

  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)
  converter.runUntilFinished()

  expect(getPinMappings(converter.getOutputString())).toEqual({
    "1": "2",
    "2": "1",
  })
})
