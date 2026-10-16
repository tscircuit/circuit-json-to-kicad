import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { Circuit } from "tscircuit"

// A (version 20241229) board must use KiCad 9 layer ordinals
// (include/layer_ids.h: F.Cu=0, B.Cu=2, In1.Cu=4, F.SilkS=5, Edge.Cuts=25 ...).
// Importers that choose their layer table from the version stamp (EasyEDA Pro)
// fail on the KiCad <=8 ordinals (B.Cu=31, F.SilkS=37, Edge.Cuts=44 ...).
test("pcb layer table uses KiCad 9 ordinals for a 20241229 board", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm" layers={4}>
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} pcbY={0} />
      <capacitor
        name="C1"
        capacitance="1uF"
        footprint="0402"
        pcbX={2}
        pcbY={0}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const out = converter.getOutputString()

  expect(out).toContain("(version 20241229)")
  const ordinal = (name: string) => {
    const m = out.match(
      new RegExp(`\\((\\d+)\\s+"?${name.replace(".", "\\.")}"?\\s+`),
    )
    return m ? Number(m[1]) : undefined
  }
  expect(ordinal("F.Cu")).toBe(0)
  expect(ordinal("In1.Cu")).toBe(4)
  expect(ordinal("In2.Cu")).toBe(6)
  expect(ordinal("B.Cu")).toBe(2)
  expect(ordinal("F.Mask")).toBe(1)
  expect(ordinal("B.Mask")).toBe(3)
  expect(ordinal("F.SilkS")).toBe(5)
  expect(ordinal("B.SilkS")).toBe(7)
  expect(ordinal("Edge.Cuts")).toBe(25)
  expect(ordinal("F.CrtYd")).toBe(31)
  expect(ordinal("F.Fab")).toBe(35)
})

// KiCad gives the placed symbol's Footprint field precedence over the library
// symbol's, so an empty instance field means "no footprint" (empty <footprint>
// in kicad-cli's netlist export) and breaks footprint binding on import.
test("placed schematic symbols carry the same footprint as their PCB footprint", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} pcbY={0} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcb.runUntilFinished()
  const fpName = pcb
    .getOutputString()
    .match(/\(footprint[\s\S]*?"(tscircuit:[^"]+)"/)?.[1]
  expect(fpName).toBeDefined()

  const sch = new CircuitJsonToKicadSchConverter(circuitJson)
  sch.runUntilFinished()
  const schOut = sch.getOutputString()
  const libEnd = schOut.indexOf("\n  )", schOut.indexOf("(lib_symbols"))
  const placed = schOut.slice(libEnd)
  expect(placed).toContain(`(property "Footprint" "${fpName}"`)
  expect(placed).not.toMatch(
    /\(lib_id "Device:[^"]+"\)[\s\S]*?\(property "Footprint" ""/,
  )
})
