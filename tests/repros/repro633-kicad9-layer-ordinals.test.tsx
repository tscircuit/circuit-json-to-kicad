import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib"
import { parseKicadPcb } from "kicadts"
import { Circuit } from "tscircuit"

// Layer ordinals from KiCad 9's include/layer_ids.h, as written by KiCad
// itself for `(version 20241229)` boards: copper is even, technical layers odd.
const KICAD9_LAYER_ORDINALS: Record<string, number> = {
  "F.Cu": 0,
  "B.Cu": 2,
  "In1.Cu": 4,
  "In2.Cu": 6,
  "F.Mask": 1,
  "B.Mask": 3,
  "F.SilkS": 5,
  "B.SilkS": 7,
  "F.Adhes": 9,
  "B.Adhes": 11,
  "F.Paste": 13,
  "B.Paste": 15,
  "Dwgs.User": 17,
  "Cmts.User": 19,
  "Eco1.User": 21,
  "Eco2.User": 23,
  "Edge.Cuts": 25,
  Margin: 27,
  "B.CrtYd": 29,
  "F.CrtYd": 31,
  "B.Fab": 33,
  "F.Fab": 35,
}

const Example = ({ layers }: { layers: 2 | 4 }) => (
  <board width="20mm" height="12mm" layers={layers}>
    <resistor name="R1" resistance="1k" footprint="0603" pcbX={-4} pcbY={0} />
    <led name="D1" color="red" footprint="0603" pcbX={4} pcbY={0} />
    <trace from=".R1 > .pin2" to=".D1 > .anode" />
    <trace from=".R1 > .pin1" to="net.VCC" />
    <trace from=".D1 > .cathode" to="net.GND" />
  </board>
)

const renderCircuitJson = async (layers: 2 | 4) => {
  const circuit = new Circuit()
  circuit.add(<Example layers={layers} />)
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}

test.failing("repro633: KiCad 9 boards use KiCad 9 layer ordinals", async () => {
  for (const layers of [2, 4] as const) {
    const converter = new CircuitJsonToKicadPcbConverter(
      await renderCircuitJson(layers),
    )
    converter.runUntilFinished()
    const output = converter.getOutputString()
    expect(output).toContain("(version 20241229)")

    const ordinals = Object.fromEntries(
      parseKicadPcb(output).layers!.definitions.map((definition) => [
        definition.name,
        definition.index,
      ]),
    )
    // A 2-layer board has no inner copper.
    const missingLayers = layers === 4 ? [] : ["In1.Cu", "In2.Cu"]
    expect(ordinals).toEqual(
      Object.fromEntries(
        Object.entries(KICAD9_LAYER_ORDINALS).filter(
          ([name]) => !missingLayers.includes(name),
        ),
      ),
    )
  }
})
