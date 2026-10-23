import { expect, test } from "bun:test"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { parseKicadPcb, parseKicadSch } from "kicadts"
import { Circuit } from "tscircuit"

// Real board: https://tscircuit.com/mukesh-dev-git/555-led-blinker (v1.0.1),
// its index.circuit.tsx copied as-is (biome-formatted).
// NE555 astable LED blinker, powered from a 2-pin header (5-12 V).
// f = 1.44 / ((R1 + 2 * R2) * C1) = 1.44 / ((1k + 940k) * 1uF) ~ 1.5 Hz
const Blinker555 = () => (
  <board width="30mm" height="20mm">
    <schematicsection name="Power" displayName="Power Input" />
    <schematicsection name="Timer" displayName="NE555 Astable" />
    <schematicsection name="Led" displayName="LED Output" />
    <pinheader
      name="J1"
      schSectionName="Power"
      pinCount={2}
      pitch="2.54mm"
      pinLabels={["VCC", "GND"]}
      pcbX={-12}
      pcbY={0}
      pcbRotation={90}
      schX={-10}
      schY={0}
    />
    <chip
      name="U1"
      schSectionName="Timer"
      manufacturerPartNumber="NE555DR"
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
      pinAttributes={{
        VCC: { requiresPower: true },
        GND: { requiresGround: true },
        RESET: { mustBeConnected: true },
        TRIG: { mustBeConnected: true },
        THRES: { mustBeConnected: true },
      }}
      schPinArrangement={{
        leftSide: {
          direction: "top-to-bottom",
          pins: ["RESET", "DISCH", "THRES", "TRIG"],
        },
        rightSide: {
          direction: "top-to-bottom",
          pins: ["VCC", "OUT", "CTRL", "GND"],
        },
      }}
      pcbX={0}
      pcbY={0}
      schX={0}
      schY={0}
    />
    <capacitor
      name="C3"
      schSectionName="Power"
      capacitance="100nF"
      footprint="0603"
      pcbX={0}
      pcbY={6}
      pcbRotation={180}
      schX={-8}
      schY={-3}
      schRotation={-90}
    />
    <resistor
      name="R1"
      schSectionName="Timer"
      resistance="1k"
      footprint="0603"
      pcbX={-6}
      pcbY={5}
      pcbRotation={180}
      schX={-4}
      schY={2.5}
      schRotation={-90}
    />
    <resistor
      name="R2"
      schSectionName="Timer"
      resistance="470k"
      footprint="0603"
      pcbX={-6}
      pcbY={-1}
      schX={-4}
      schY={-0.5}
      schRotation={90}
    />
    <capacitor
      name="C1"
      schSectionName="Timer"
      capacitance="1uF"
      footprint="0805"
      pcbX={-6}
      pcbY={-6}
      schX={-4}
      schY={-3.5}
      schRotation={-90}
    />
    <capacitor
      name="C2"
      schSectionName="Timer"
      capacitance="10nF"
      footprint="0603"
      pcbX={5}
      pcbY={-6}
      schX={3}
      schY={-3}
      schRotation={-90}
    />
    <resistor
      name="R3"
      schSectionName="Led"
      resistance="330"
      footprint="0603"
      pcbX={7}
      pcbY={2}
      schX={6}
      schY={1}
      schRotation={-90}
    />
    <led
      name="D1"
      schSectionName="Led"
      color="red"
      footprint="0603"
      supplierPartNumbers={{ jlcpcb: ["C2286"] }}
      pcbX={11}
      pcbY={2}
      schX={6}
      schY={-1.5}
      schRotation={-90}
    />

    <trace from=".J1 > .VCC" to="net.VCC" />
    <trace from=".J1 > .GND" to="net.GND" />
    <trace from=".U1 > .VCC" to="net.VCC" />
    <trace from=".U1 > .RESET" to="net.VCC" />
    <trace from=".U1 > .GND" to="net.GND" />
    <trace from=".C3 > .pin1" to="net.VCC" />
    <trace from=".C3 > .pin2" to="net.GND" />

    <trace from=".R1 > .pin1" to="net.VCC" />
    <trace name="DISCH_R1" from=".R1 > .pin2" to=".U1 > .DISCH" />
    <trace name="DISCH_R2" from=".R2 > .pin1" to=".U1 > .DISCH" />
    <trace name="THRES_R2" from=".R2 > .pin2" to=".U1 > .THRES" />
    <trace name="THRES_TRIG" from=".U1 > .THRES" to=".U1 > .TRIG" />
    <trace name="TRIG_C1" from=".C1 > .pin1" to=".U1 > .TRIG" />
    <trace from=".C1 > .pin2" to="net.GND" />
    <trace name="CTRL_C2" from=".C2 > .pin1" to=".U1 > .CTRL" />
    <trace from=".C2 > .pin2" to="net.GND" />

    <trace name="OUT_R3" from=".U1 > .OUT" to=".R3 > .pin1" />
    <trace name="LED_ANODE" from=".R3 > .pin2" to=".D1 > .anode" />
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
test("repro633: 555 blinker schematic symbols carry their PCB footprints", async () => {
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
    ["C1", "C2", "C3", "D1", "J1", "R1", "R2", "R3", "U1"].sort(),
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
