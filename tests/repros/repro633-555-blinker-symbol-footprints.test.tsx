import { expect, test } from "bun:test"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { parseKicadPcb, parseKicadSch } from "kicadts"
import { Circuit } from "tscircuit"

// Classic NE555 astable LED blinker powered from a 2-pin header.
const Blinker555 = () => (
  <board width="30mm" height="20mm">
    <pinheader
      name="J1"
      pinCount={2}
      pitch="2.54mm"
      pinLabels={["VCC", "GND"]}
      pcbX={-12}
      pcbY={0}
      schX={-8}
    />
    <chip
      name="U1"
      footprint="soic8"
      pinLabels={{
        pin1: "GND",
        pin2: "TRIG",
        pin3: "OUT",
        pin4: "RESET",
        pin5: "CTRL",
        pin6: "THRES",
        pin7: "DISCH",
        pin8: "VCC",
      }}
      pcbX={0}
      pcbY={0}
    />
    <resistor
      name="R1"
      resistance="1k"
      footprint="0603"
      pcbX={-5}
      pcbY={6}
      schX={-4}
      schY={3}
    />
    <resistor
      name="R2"
      resistance="470k"
      footprint="0603"
      pcbX={-5}
      pcbY={-6}
      schX={-4}
      schY={-3}
    />
    <capacitor
      name="C1"
      capacitance="1uF"
      footprint="0805"
      pcbX={6}
      pcbY={6}
      schX={4}
      schY={3}
    />
    <capacitor
      name="C2"
      capacitance="10nF"
      footprint="0603"
      pcbX={6}
      pcbY={-6}
      schX={4}
      schY={-3}
    />
    <resistor
      name="R3"
      resistance="330"
      footprint="0603"
      pcbX={11}
      pcbY={2}
      schX={7}
      schY={0}
    />
    <led
      name="D1"
      color="red"
      footprint="0603"
      pcbX={11}
      pcbY={-3}
      schX={9}
      schY={0}
    />
    <trace from=".J1 > .VCC" to="net.VCC" />
    <trace from=".J1 > .GND" to="net.GND" />
    <trace from=".U1 > .VCC" to="net.VCC" />
    <trace from=".U1 > .RESET" to="net.VCC" />
    <trace from=".U1 > .GND" to="net.GND" />
    <trace from=".R1 > .pin1" to="net.VCC" />
    <trace from=".R1 > .pin2" to=".U1 > .DISCH" />
    <trace from=".R2 > .pin1" to=".U1 > .DISCH" />
    <trace from=".R2 > .pin2" to=".U1 > .THRES" />
    <trace from=".U1 > .THRES" to=".U1 > .TRIG" />
    <trace from=".C1 > .pin1" to=".U1 > .TRIG" />
    <trace from=".C1 > .pin2" to="net.GND" />
    <trace from=".C2 > .pin1" to=".U1 > .CTRL" />
    <trace from=".C2 > .pin2" to="net.GND" />
    <trace from=".U1 > .OUT" to=".R3 > .pin1" />
    <trace from=".R3 > .pin2" to=".D1 > .anode" />
    <trace from=".D1 > .cathode" to="net.GND" />
  </board>
)

const getProperty = (
  item: { properties: { key: string; value: string }[] },
  key: string,
) => item.properties.find((property) => property.key === key)?.value

// KiCad reads a part's footprint from the placed schematic symbol, not from
// lib_symbols. With an empty field, `kicad-cli sch export netlist` has no
// footprints and EasyEDA Pro's importer can't bind symbols to the board (#633).
test.failing("repro633: 555 blinker schematic symbols carry their PCB footprints", async () => {
  const circuit = new Circuit()
  circuit.add(<Blinker555 />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const pcbFootprints = Object.fromEntries(
    parseKicadPcb(pcbConverter.getOutputString()).footprints.map(
      (footprint) => [
        getProperty(footprint, "Reference"),
        footprint.libraryLink,
      ],
    ),
  )
  expect(Object.keys(pcbFootprints).sort()).toEqual(
    ["C1", "C2", "D1", "J1", "R1", "R2", "R3", "U1"].sort(),
  )

  const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  schConverter.runUntilFinished()
  const symbolFootprints = Object.fromEntries(
    parseKicadSch(schConverter.getOutputString())
      .symbols.map((symbol) => [
        getProperty(symbol, "Reference"),
        getProperty(symbol, "Footprint"),
      ])
      .filter(([reference]) => reference! in pcbFootprints),
  )

  expect(symbolFootprints).toEqual(pcbFootprints)
})
