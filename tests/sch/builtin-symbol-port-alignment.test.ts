import { expect, test } from "bun:test"
import { cju } from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { applyToPoint } from "transformation-matrix"
import fixture from "../assets/repro23-generated-system-bluetooth-audio.circuit.json"

test("updated builtin symbols keep pins at the saved Circuit JSON ports", () => {
  const db = cju(fixture as CircuitJson)
  const source = db.source_component.list().find((c) => c.name === "S1")!
  const component = db.schematic_component
    .list()
    .find((c) => c.source_component_id === source.source_component_id)!
  const ports = db.schematic_port
    .list()
    .filter(
      (p) => p.schematic_component_id === component.schematic_component_id,
    )
  const circuitJson: CircuitJson = [source, component, ...ports]
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  const symbol = schematic.symbols.find((s) =>
    s.properties.some((p) => p.key === "Reference" && p.value === "S1"),
  )!
  const library = schematic.libSymbols!.symbols.find(
    (s) => s.libraryId === symbol.libraryId,
  )!
  const pins = library.subSymbols.flatMap((s) => s.pins)
  expect(pins).toHaveLength(ports.length)
  for (const port of ports) {
    const pin = pins.find((p) => p.numberString === String(port.pin_number))!
    const expected = applyToPoint(converter.ctx.c2kMatSch!, port.center)
    expect(symbol.at!.x + pin.at!.x).toBeCloseTo(expected.x, 6)
    expect(symbol.at!.y - pin.at!.y).toBeCloseTo(expected.y, 6)
  }
})
