import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"

function getLibIdOfInstance(kicadSchematic: string, reference: string) {
  const instances = kicadSchematic.split(/\n\s*\(symbol\s*\n\s*\(lib_id /)
  const instance = instances.find((block) =>
    block.includes(`(property "Reference" "${reference}"`),
  )
  return instance?.match(/^"([^"]+)"/)?.[1]
}

function getLibraryPinAt(kicadSchematic: string, libId: string) {
  const start = kicadSchematic.indexOf(`(symbol "${libId}"`)
  if (start === -1) throw new Error(`Missing library symbol ${libId}`)
  return kicadSchematic.slice(start).match(/\(pin [\s\S]*?\(at ([^)]+)\)/)?.[1]
}

// One custom symbol named "Shared": a box with a pin on its right edge,
// halfLength wide each side of the centre (cx, cy)
function sharedSymbolInstance(
  ref: string,
  cx: number,
  cy: number,
  halfLength: number,
) {
  const id = ref.toLowerCase()
  return [
    {
      type: "schematic_symbol",
      schematic_symbol_id: `schematic_symbol_${id}`,
      name: "Shared",
    },
    {
      type: "schematic_path",
      schematic_path_id: `schematic_path_${id}`,
      schematic_symbol_id: `schematic_symbol_${id}`,
      schematic_component_id: `schematic_component_${id}`,
      points: [
        { x: cx - halfLength, y: cy - 0.4 },
        { x: cx + halfLength, y: cy - 0.4 },
        { x: cx + halfLength, y: cy + 0.4 },
        { x: cx - halfLength, y: cy + 0.4 },
        { x: cx - halfLength, y: cy - 0.4 },
      ],
      is_filled: false,
    },
    {
      type: "source_component",
      source_component_id: `source_component_${id}`,
      name: ref,
      ftype: "simple_chip",
    },
    {
      type: "source_port",
      source_port_id: `source_port_${id}`,
      source_component_id: `source_component_${id}`,
      name: "pin1",
      pin_number: 1,
    },
    {
      type: "schematic_component",
      schematic_component_id: `schematic_component_${id}`,
      source_component_id: `source_component_${id}`,
      schematic_symbol_id: `schematic_symbol_${id}`,
      center: { x: cx, y: cy },
      rotation: 0,
      size: { width: halfLength * 2, height: 0.8 },
    },
    {
      type: "schematic_port",
      schematic_port_id: `schematic_port_${id}`,
      schematic_symbol_id: `schematic_symbol_${id}`,
      schematic_component_id: `schematic_component_${id}`,
      source_port_id: `source_port_${id}`,
      center: { x: cx + halfLength, y: cy },
      facing_direction: "right",
      pin_number: 1,
      display_pin_label: "1",
    },
  ]
}

test("repro663: custom symbols sharing a name but not geometry get their own lib ids", () => {
  const circuitJson = [
    ...sharedSymbolInstance("A1", 0, 0, 1),
    // Same name, drawn twice as long: its pin sits further out
    ...sharedSymbolInstance("A2", 0, -3, 2),
    // Same name and geometry as A1, placed elsewhere
    ...sharedSymbolInstance("A3", 0, 3, 1),
  ] as any

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const kicadSchematic = converter.getOutputString()

  const a1 = getLibIdOfInstance(kicadSchematic, "A1")
  const a2 = getLibIdOfInstance(kicadSchematic, "A2")
  const a3 = getLibIdOfInstance(kicadSchematic, "A3")
  expect(a1).toBe("Custom:Shared")
  expect(a2).toBe("Custom:Shared_2")
  expect(a3).toBe("Custom:Shared")

  expect(getLibraryPinAt(kicadSchematic, a2!)).not.toBe(
    getLibraryPinAt(kicadSchematic, a1!),
  )
  expect(
    kicadSchematic.match(/\(symbol "Custom:Shared(_\d+)?"\n/g),
  ).toHaveLength(2)
})
