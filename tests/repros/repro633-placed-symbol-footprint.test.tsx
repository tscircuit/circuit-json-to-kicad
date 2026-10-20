import { expect, test } from "bun:test"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { parseKicadPcb, parseKicadSch } from "kicadts"
import { Circuit } from "tscircuit"

const Example = () => (
  <board width="20mm" height="12mm">
    <resistor name="R1" resistance="1k" footprint="0603" pcbX={-4} pcbY={0} />
    <led name="D1" color="red" footprint="0603" pcbX={4} pcbY={0} />
    <trace from=".R1 > .pin2" to=".D1 > .anode" />
    <trace from=".R1 > .pin1" to="net.VCC" />
    <trace from=".D1 > .cathode" to="net.GND" />
  </board>
)

const renderCircuitJson = async () => {
  const circuit = new Circuit()
  circuit.add(<Example />)
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}

test("repro633: placed schematic symbols carry their PCB footprint", async () => {
  const circuitJson = await renderCircuitJson()

  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const pcbFootprints = parseKicadPcb(
    pcbConverter.getOutputString(),
  ).footprints.map((footprint) => footprint.libraryLink)
  expect(pcbFootprints).toEqual([
    "tscircuit:resistor_res0603",
    "tscircuit:led_0603_color_red",
  ])

  const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  schConverter.runUntilFinished()
  const schematic = parseKicadSch(schConverter.getOutputString())

  const footprintOf = (reference: string) => {
    const symbol = schematic.symbols.find((symbol) =>
      symbol.properties.some(
        (property) =>
          property.key === "Reference" && property.value === reference,
      ),
    )!
    return symbol.properties.find((property) => property.key === "Footprint")
      ?.value
  }

  // KiCad uses the placed symbol's field, not the lib_symbols copy, so an
  // empty value means "no footprint" in netlists and EasyEDA's importer.
  expect(footprintOf("R1")).toBe("tscircuit:resistor_res0603")
  expect(footprintOf("D1")).toBe("tscircuit:led_0603_color_red")
})
