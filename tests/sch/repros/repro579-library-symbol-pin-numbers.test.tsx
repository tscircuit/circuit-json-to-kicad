import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { createPinSubsymbol } from "lib/schematic/stages/utils/createPinSubsymbol"
import type {
  CircuitJson,
  SchematicComponent,
  SchematicPort,
  SourcePort,
} from "circuit-json"
import { Circuit } from "tscircuit"

function getPinMappingEntries(kicadSchematic: string) {
  return Array.from(
    kicadSchematic.matchAll(
      /\(pin passive line[\s\S]*?\(name "([^"]+)"[\s\S]*?\(number "([^"]+)"/g,
    ),
    ([, name, number]) => [name, number] as const,
  )
}

function getPinMappings(kicadSchematic: string) {
  return Object.fromEntries(getPinMappingEntries(kicadSchematic))
}

async function renderFourPinCrystal(): Promise<CircuitJson> {
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
  return circuit.getCircuitJson()
}

test("repro579: library symbol pin numbers match circuit pin numbers", async () => {
  const converter = new CircuitJsonToKicadSchConverter(
    await renderFourPinCrystal(),
  )
  converter.runUntilFinished()

  expect(getPinMappings(converter.getOutputString())).toEqual({
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
  })
})

test("repro579: missing schematic pin numbers resolve through source ports", async () => {
  const circuitJson = await renderFourPinCrystal()
  const sourcePort = circuitJson.find(
    (element): element is SourcePort =>
      element.type === "source_port" && element.pin_number === 3,
  )
  if (!sourcePort) throw new Error("Expected crystal source pin 3")

  const schematicPort = circuitJson.find(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.source_port_id === sourcePort.source_port_id,
  )
  if (!schematicPort) throw new Error("Expected crystal schematic pin 3")
  delete schematicPort.pin_number

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  expect(getPinMappings(converter.getOutputString())).toEqual({
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
  })
})

test("repro579: incomplete inferred mappings do not create duplicate pin numbers", async () => {
  const circuitJson = await renderFourPinCrystal()
  const sourcePort = circuitJson.find(
    (element): element is SourcePort =>
      element.type === "source_port" && element.pin_number === 3,
  )
  if (!sourcePort) throw new Error("Expected crystal source pin 3")

  const schematicPort = circuitJson.find(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.source_port_id === sourcePort.source_port_id,
  )
  if (!schematicPort) throw new Error("Expected crystal schematic pin 3")
  delete schematicPort.pin_number
  delete sourcePort.pin_number

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const pinNumbers = getPinMappingEntries(converter.getOutputString())
    .slice(0, 4)
    .map(([, pinNumber]) => pinNumber)
  expect(new Set(pinNumbers).size).toBe(pinNumbers.length)
})

test("repro579: explicit imported symbol pin numbers take precedence", () => {
  const pinSymbol = createPinSubsymbol({
    libId: "Custom:Crystal_GND2",
    symbolData: {
      center: { x: 0, y: 0 },
      size: { width: 8, height: 10 },
      primitives: [],
      ports: [
        { x: -3.81, y: 0, labels: ["1"], pinNumber: 1 },
        { x: 0, y: -5.08, labels: ["2"], pinNumber: 2 },
        { x: 3.81, y: 0, labels: ["3"], pinNumber: 3 },
      ],
    },
    isChip: false,
    schematicComponent: {
      type: "schematic_component",
      schematic_component_id: "schematic_component_0",
      source_component_id: "source_component_0",
      center: { x: 0, y: 0 },
      rotation: 0,
      size: { width: 8, height: 10 },
      is_box_with_pins: false,
    } as SchematicComponent,
    schematicPorts: [
      {
        schematic_component_id: "schematic_component_0",
        center: { x: -3.81, y: 0 },
        facing_direction: "left",
        pin_number: 1,
      },
      {
        schematic_component_id: "schematic_component_0",
        center: { x: 3.81, y: 0 },
        facing_direction: "right",
        pin_number: 2,
      },
      {
        schematic_component_id: "schematic_component_0",
        center: { x: 0, y: -5.08 },
        facing_direction: "down",
        pin_number: 3,
      },
    ] as SchematicPort[],
    sourcePorts: [],
    c2kMatSchScale: 1,
  })

  expect(pinSymbol.pins.map((pin) => pin._sxNumber?.value)).toEqual([
    "1",
    "2",
    "3",
  ])
})

test("repro579: pin numbers come from circuit ports, not numeric symbol labels", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <led name="D1" color="red" footprint="0603" />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const component = circuitJson.find(
    (element): element is SchematicComponent =>
      element.type === "schematic_component",
  )
  if (!component) throw new Error("Expected LED schematic component")

  const ports = circuitJson.filter(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.schematic_component_id === component.schematic_component_id,
  )
  const [firstPort, secondPort] = ports
  if (!firstPort || !secondPort) throw new Error("Expected two LED ports")

  ;[firstPort.center, secondPort.center] = [secondPort.center, firstPort.center]
  ;[firstPort.facing_direction, secondPort.facing_direction] = [
    secondPort.facing_direction,
    firstPort.facing_direction,
  ]

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  expect(getPinMappings(converter.getOutputString())).toEqual({
    "1": "2",
    "2": "1",
  })
})
