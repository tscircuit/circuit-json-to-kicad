import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import sharp from "sharp"
import { Circuit } from "tscircuit-latest"
import { X322525MRB4SI } from "../../../imports/X322525MRB4SI"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const decouplingCapacitors = ["C51", "C52", "C53", "C54"] as const
const ethernetTerminationCapacitors = ["C32", "C33", "C34", "C35"] as const

test("repro26: Ethernet pin names collide with connected net labels", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board
      width="45mm"
      height="28mm"
      autorouter={{ preset: "auto", local: true }}
    >
      <schematictext
        text="4. USB Gigabit Ethernet"
        schX={-8}
        schY={7}
        fontSize={0.32}
      />

      <chip
        name="U3"
        manufacturerPartNumber="RTL8153B-VB-CG"
        supplierPartNumbers={{ jlcpcb: ["C2802072"] }}
        footprint="qfn48_w6mm_h6mm_p0.4mm"
        pcbX={0}
        pcbY={0}
        schX={0}
        schY={0}
        pinLabels={{
          pin1: "VDD33",
          pin2: "GND",
          pin3: "USB_DP",
          pin4: "USB_DM",
          pin5: "XTAL_IN",
          pin6: "XTAL_OUT",
          pin7: "MDI0P",
          pin8: "MDI0N",
          pin9: "MDI1P",
          pin10: "MDI1N",
          pin11: "MDI2P",
          pin12: "MDI2N",
          pin13: "MDI3P",
          pin14: "MDI3N",
        }}
      />

      <chip
        name="J_ETH"
        manufacturerPartNumber="HR911130A"
        supplierPartNumbers={{ jlcpcb: ["C54408"] }}
        footprint="dip16"
        pcbX={15}
        pcbY={0}
        schX={8}
        schY={0}
        pinLabels={{
          pin1: "MDI0+",
          pin2: "MDI0-",
          pin3: "MDI1+",
          pin4: "MDI1-",
          pin5: "MDI2+",
          pin6: "MDI2-",
          pin7: "MDI3+",
          pin8: "MDI3-",
          pin9: "LED1A",
          pin10: "LED1K",
          pin11: "LED2A",
          pin12: "LED2K",
          pin13: "P9",
          pin14: "P10",
          pin15: "SH1",
          pin16: "SH2",
        }}
      />

      <X322525MRB4SI name="Y2" pcbX={-8} pcbY={0} schX={-6} schY={-4} />

      <inductor
        name="L3"
        inductance="2.2uH"
        footprint="0603"
        pcbX={-10}
        pcbY={7}
        schX={-6}
        schY={4}
      />
      <resistor
        name="R14"
        resistance="12.1k"
        footprint="0402"
        pcbX={-5}
        pcbY={7}
        schX={-3}
        schY={4}
      />
      <resistor
        name="R15"
        resistance="1k"
        footprint="0402"
        pcbX={6}
        pcbY={10}
        schX={4}
        schY={4}
      />

      {decouplingCapacitors.map((name, index) => (
        <capacitor
          key={name}
          name={name}
          capacitance="100nF"
          footprint="0402"
          pcbX={-12 + index * 3}
          pcbY={-8}
          schX={-9 + index * 2}
          schY={-7}
        />
      ))}
      {ethernetTerminationCapacitors.map((name, index) => (
        <capacitor
          key={name}
          name={name}
          capacitance="100nF"
          footprint="0402"
          pcbX={index * 3}
          pcbY={-8}
          schX={2 + index * 2}
          schY={-7}
        />
      ))}

      <trace from=".U3 > .MDI0P" to="net.ETH_MDI0_P" />
      <trace from=".U3 > .MDI0N" to="net.ETH_MDI0_N" />
      <trace from=".U3 > .MDI1P" to="net.ETH_MDI1_P" />
      <trace from=".U3 > .MDI1N" to="net.ETH_MDI1_N" />
      <trace from=".U3 > .MDI2P" to="net.ETH_MDI2_P" />
      <trace from=".U3 > .MDI2N" to="net.ETH_MDI2_N" />
      <trace from=".U3 > .MDI3P" to="net.ETH_MDI3_P" />
      <trace from=".U3 > .MDI3N" to="net.ETH_MDI3_N" />
      <trace from=".J_ETH > .pin1" to="net.ETH_MDI0_P" />
      <trace from=".J_ETH > .pin2" to="net.ETH_MDI0_N" />
      <trace from=".J_ETH > .pin3" to="net.ETH_MDI1_P" />
      <trace from=".J_ETH > .pin4" to="net.ETH_MDI1_N" />
      <trace from=".J_ETH > .pin5" to="net.ETH_MDI2_P" />
      <trace from=".J_ETH > .pin6" to="net.ETH_MDI2_N" />
      <trace from=".J_ETH > .pin7" to="net.ETH_MDI3_P" />
      <trace from=".J_ETH > .pin8" to="net.ETH_MDI3_N" />
      <trace from=".J_ETH > .pin15" to="net.CHASSIS_GND" />
      <trace from=".J_ETH > .pin16" to="net.CHASSIS_GND" />
      <trace from=".U3 > .XTAL_IN" to=".Y2 > .OSC1" />
      <trace from=".U3 > .XTAL_OUT" to=".Y2 > .OSC2" />
      <trace from=".Y2 > .GND1" to="net.GND" />
      <trace from=".Y2 > .GND2" to="net.GND" />
      <trace from=".L3 > .pin1" to="net.ETH_3V3" />
      <trace from=".L3 > .pin2" to=".U3 > .VDD33" pcbStraightLine />
      <trace from=".R14 > .pin1" to=".U3 > .GND" pcbStraightLine />
      <trace from=".R14 > .pin2" to="net.GND" />
      <trace from=".R15 > .pin1" to=".U3 > .VDD33" pcbStraightLine />
      <trace from=".R15 > .pin2" to="net.ETH_LED" />
      <trace from=".C51 > .pin1" to="net.ETH_3V3" />
      <trace from=".C51 > .pin2" to="net.GND" />
      <trace from=".C52 > .pin1" to="net.ETH_3V3" />
      <trace from=".C52 > .pin2" to="net.GND" />
      <trace from=".C53 > .pin1" to="net.ETH_3V3" />
      <trace from=".C53 > .pin2" to="net.GND" />
      <trace from=".C54 > .pin1" to="net.ETH_3V3" />
      <trace from=".C54 > .pin2" to="net.GND" />
      <trace from=".C32 > .pin1" to="net.ETH_CHASSIS" />
      <trace from=".C32 > .pin2" to="net.GND" />
      <trace from=".C33 > .pin1" to="net.ETH_CHASSIS" />
      <trace from=".C33 > .pin2" to="net.GND" />
      <trace from=".C34 > .pin1" to="net.ETH_CHASSIS" />
      <trace from=".C34 > .pin2" to="net.GND" />
      <trace from=".C35 > .pin1" to="net.ETH_CHASSIS" />
      <trace from=".C35 > .pin2" to="net.GND" />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson.filter((element) => element.type === "pcb_board"),
  ).toHaveLength(1)
  expect(
    circuitJson.filter((element) => element.type === "pcb_component").length,
  ).toBeGreaterThan(10)
  expect(
    circuitJson.filter(
      (element) =>
        element.type === "schematic_text" &&
        element.text?.startsWith("ETH_MDI"),
    ),
  ).toHaveLength(16)
  expect(
    circuitJson.some(
      (element) =>
        element.type === "schematic_port" &&
        element.display_pin_label === "MDI0+",
    ),
  ).toBe(true)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  expect(output).toContain("ETH_MDI0_P")

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  const schematicPng = await sharp(
    await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
  )
    .resize(1200, 850, { fit: "contain", background: "#f5f1ed" })
    .png()
    .toBuffer()
  await expect(
    stackCircuitJsonKicadPngs(
      schematicPng,
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 120_000)
