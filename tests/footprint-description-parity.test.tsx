import { expect, test } from "bun:test"
import { parseKicadPcb, parseKicadSch } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { Circuit } from "tscircuit"

// KiCad's schematic parity check compares the Description field of each
// footprint with its symbol. The PCB used to write "" while the schematic
// wrote "Resistor", "Capacitor", ... so every part was reported.
test("footprint Description matches the schematic symbol", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-6} />
      <capacitor name="C1" capacitance="100nF" footprint="0402" pcbX={-2} />
      <led name="D1" color="green" footprint="0603" pcbX={2} />
      <chip name="U1" footprint="sot23" pcbX={6} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  schConverter.runUntilFinished()

  const getField = (
    properties: { key: string; value: string }[],
    key: string,
  ) => properties.find((property) => property.key === key)?.value

  const pcbDescriptions = Object.fromEntries(
    parseKicadPcb(pcbConverter.getOutputString()).footprints.map(
      (footprint) => [
        getField(footprint.properties, "Reference"),
        getField(footprint.properties, "Description"),
      ],
    ),
  )
  const schDescriptions = Object.fromEntries(
    parseKicadSch(schConverter.getOutputString()).symbols.map((symbol) => [
      getField(symbol.properties, "Reference"),
      getField(symbol.properties, "Description"),
    ]),
  )

  expect(pcbDescriptions).toEqual(schDescriptions)
  expect(pcbDescriptions).toMatchInlineSnapshot(`
    {
      "C1": "Capacitor",
      "D1": "LED",
      "R1": "Resistor",
      "U1": "Integrated Circuit",
    }
  `)
})
