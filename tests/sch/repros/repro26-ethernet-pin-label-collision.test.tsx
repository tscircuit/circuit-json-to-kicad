import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import sharp from "sharp"
import { Circuit } from "tscircuit-latest"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const pinLabels = {
  pin11: ["LED1A"],
  pin12: ["LED1K"],
  pin13: ["LED2A"],
  pin14: ["LED2K"],
  pin15: ["MDI0+"],
  pin16: ["MDI0-"],
  pin17: ["MDI1-"],
  pin18: ["MDI2-"],
  pin19: ["MDI3-"],
  pin20: ["MDI1+"],
  pin21: ["MDI2+"],
  pin22: ["MDI3+"],
  pin23: ["SH1"],
  pin24: ["SH2"],
  pin25: ["P9"],
  pin26: ["P10"],
} as const

const decouplingCapacitors = ["C32", "C33", "C34", "C35"] as const
const ethernetCapacitors = [
  "C28",
  "C29",
  "C30",
  "C31",
  "C36",
  "C37",
  "C51",
  "C52",
  "C53",
  "C54",
] as const

const Magjack = () => (
  <chip
    name="J_ETH"
    manufacturerPartNumber="HR911130A"
    footprint="dip26"
    pinLabels={pinLabels}
    schWidth={2.15}
    schHeight={4}
    schPinArrangement={{
      leftSide: {
        direction: "top-to-bottom",
        pins: [15, 16, 20, 17, 21, 18, 22, 19],
      },
      rightSide: {
        direction: "top-to-bottom",
        pins: [11, 12, 13, 14, 25, 26, 23, 24],
      },
    }}
    schX={8}
    schY={2.1}
  />
)

test("repro26: Ethernet pin names collide with connected net labels", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="45mm" height="28mm" routingDisabled>
      <chip
        name="U3"
        manufacturerPartNumber="RTL8153B-VB-CG"
        footprint="qfn48_w6mm_h6mm_p0.4mm"
        schX={0}
        schY={0.8}
        pinLabels={{
          pin1: "MDI0P",
          pin2: "MDI0N",
          pin3: "MDI1P",
          pin4: "MDI1N",
          pin5: "MDI2P",
          pin6: "MDI2N",
          pin7: "MDI3P",
          pin8: "MDI3N",
          pin9: "USB_DP",
          pin10: "USB_DM",
          pin11: "XTAL_IN",
          pin12: "XTAL_OUT",
        }}
        schPinArrangement={{
          leftSide: {
            direction: "top-to-bottom",
            pins: [
              "MDI0P",
              "MDI0N",
              "MDI1P",
              "MDI1N",
              "MDI2P",
              "MDI2N",
              "MDI3P",
              "MDI3N",
            ],
          },
          rightSide: {
            direction: "top-to-bottom",
            pins: ["USB_DP", "USB_DM", "XTAL_IN", "XTAL_OUT"],
          },
        }}
      />
      <Magjack />
      <trace from=".J_ETH > .pin15" to="net.ETH_MDI0_P" />
      <trace from=".J_ETH > .pin16" to="net.ETH_MDI0_N" />
      <trace from=".J_ETH > .pin20" to="net.ETH_MDI1_P" />
      <trace from=".J_ETH > .pin17" to="net.ETH_MDI1_N" />
      <trace from=".J_ETH > .pin21" to="net.ETH_MDI2_P" />
      <trace from=".J_ETH > .pin18" to="net.ETH_MDI2_N" />
      <trace from=".J_ETH > .pin22" to="net.ETH_MDI3_P" />
      <trace from=".J_ETH > .pin19" to="net.ETH_MDI3_N" />
      <trace from=".J_ETH > .pin23" to="net.CHASSIS_GND" />
      <trace from=".J_ETH > .pin24" to="net.CHASSIS_GND" />
      <trace from=".U3 > .MDI0P" to="net.ETH_MDI0_P" />
      <trace from=".U3 > .MDI0N" to="net.ETH_MDI0_N" />
      <trace from=".U3 > .MDI1P" to="net.ETH_MDI1_P" />
      <trace from=".U3 > .MDI1N" to="net.ETH_MDI1_N" />
      <trace from=".U3 > .MDI2P" to="net.ETH_MDI2_P" />
      <trace from=".U3 > .MDI2N" to="net.ETH_MDI2_N" />
      <trace from=".U3 > .MDI3P" to="net.ETH_MDI3_P" />
      <trace from=".U3 > .MDI3N" to="net.ETH_MDI3_N" />
      <inductor
        name="L3"
        inductance="2.2uH"
        footprint="0603"
        schX={2}
        schY={5}
      />
      <resistor
        name="R14"
        resistance="10k"
        footprint="0402"
        schX={-1.5}
        schY={-3.5}
      />
      <resistor
        name="R15"
        resistance="2.49k"
        footprint="0402"
        schX={6.9}
        schY={-1.9}
      />
      <crystal
        name="Y2"
        frequency="25MHz"
        loadCapacitance="10pF"
        footprint="hc49"
        schX={4.4}
        schY={-2.3}
      />
      {decouplingCapacitors.map((name, index) => (
        <capacitor
          key={name}
          name={name}
          capacitance="100nF"
          footprint="0402"
          schX={-6.8 + index * 1.25}
          schY={0.3}
          schRotation={270}
        />
      ))}
      {ethernetCapacitors.map((name, index) => (
        <capacitor
          key={name}
          name={name}
          capacitance={
            name === "C29"
              ? "1uF"
              : name === "C30" || name === "C31"
                ? "27pF"
                : name === "C28"
                  ? "10uF"
                  : "100nF"
          }
          footprint="0402"
          schX={-3 + (index % 5) * 2.1}
          schY={-4.7 - Math.floor(index / 5) * 1.2}
          schRotation={270}
        />
      ))}
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson.filter((element) => element.type === "schematic_component"),
  ).toHaveLength(20)
  expect(
    circuitJson.filter((element) => element.type === "schematic_port"),
  ).toHaveLength(64)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  expect(output).toContain('(name "MDI0+"')
  expect(output).toContain('(text "ETH_MDI0_P"')
  expect(output).toContain("(length 0.01)")

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
