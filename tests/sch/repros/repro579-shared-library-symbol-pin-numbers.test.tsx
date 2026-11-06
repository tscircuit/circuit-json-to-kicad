import { expect, test } from "bun:test"
import type {
  SchematicComponent,
  SchematicPort,
  SourceComponentBase,
} from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

function getLibIdOfInstance(kicadSchematic: string, reference: string) {
  const instances = kicadSchematic.split(/\n\s*\(symbol\s*\n\s*\(lib_id /)
  const instance = instances.find((block) =>
    block.includes(`(property "Reference" "${reference}"`),
  )
  return instance?.match(/^"([^"]+)"/)?.[1]
}

function getLibraryPinMappings(kicadSchematic: string, libId: string) {
  const start = kicadSchematic.indexOf(`(symbol "${libId}"`)
  if (start === -1) throw new Error(`Missing library symbol ${libId}`)
  const end = kicadSchematic.indexOf("(embedded_fonts", start)
  return Object.fromEntries(
    Array.from(
      kicadSchematic
        .slice(start, end)
        .matchAll(
          /\(pin passive line[\s\S]*?\(name "([^"]+)"[\s\S]*?\(number "([^"]+)"/g,
        ),
      ([, name, number]) => [name, number],
    ),
  )
}

test("repro579: instances of one library symbol with different pin numbering get their own lib ids", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <led name="D1" color="red" footprint="0603" pcbX={-3} />
      <led name="D2" color="red" footprint="0603" pcbX={3} />
      <led name="D3" color="red" footprint="0603" pcbY={4} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  // Draw D2 the other way round from its symbol, as core does for an LED whose
  // pin 1 is labelled as the cathode.
  const d2 = circuitJson.find(
    (element) => element.type === "source_component" && element.name === "D2",
  )
  const d2Schematic = circuitJson.find(
    (element): element is SchematicComponent =>
      element.type === "schematic_component" &&
      element.source_component_id ===
        (d2 as SourceComponentBase | undefined)?.source_component_id,
  )
  const [firstPort, secondPort] = circuitJson.filter(
    (element): element is SchematicPort =>
      element.type === "schematic_port" &&
      element.schematic_component_id === d2Schematic?.schematic_component_id,
  )
  if (!firstPort || !secondPort) throw new Error("Expected two D2 ports")
  ;[firstPort.center, secondPort.center] = [secondPort.center, firstPort.center]
  ;[firstPort.facing_direction, secondPort.facing_direction] = [
    secondPort.facing_direction,
    firstPort.facing_direction,
  ]

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const kicadSchematic = converter.getOutputString()

  const d1LibId = getLibIdOfInstance(kicadSchematic, "D1")
  const d2LibId = getLibIdOfInstance(kicadSchematic, "D2")
  const d3LibId = getLibIdOfInstance(kicadSchematic, "D3")
  if (!d1LibId || !d2LibId) throw new Error("Expected D1 and D2 instances")

  // KiCad resolves every instance of a lib id through one definition, so D2
  // must not share D1's lib id. D3 is numbered like D1 and keeps sharing it.
  expect(d2LibId).not.toBe(d1LibId)
  expect(d3LibId).toBe(d1LibId)
  expect(getLibraryPinMappings(kicadSchematic, d1LibId)).toEqual({
    "1": "1",
    "2": "2",
  })
  expect(getLibraryPinMappings(kicadSchematic, d2LibId)).toEqual({
    "1": "2",
    "2": "1",
  })
})
