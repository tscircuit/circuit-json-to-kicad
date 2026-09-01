import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import sharp from "sharp"
import { Circuit } from "tscircuit-latest"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const pinLabels = {
  pin11: "LED1A",
  pin12: "LED1K",
  pin13: "LED2A",
  pin14: "LED2K",
  pin15: "MDI0+",
  pin16: "MDI0-",
  pin17: "MDI1-",
  pin18: "MDI2-",
  pin19: "MDI3-",
  pin20: "MDI1+",
  pin21: "MDI2+",
  pin22: "MDI3+",
  pin23: "SH1",
  pin24: "SH2",
  pin25: "P9",
  pin26: "P10",
} as const

const leftPorts = [
  { pinNumber: 15, label: "MDI0+", y: 1.4 },
  { pinNumber: 16, label: "MDI0-", y: 1 },
  { pinNumber: 20, label: "MDI1+", y: 0.6 },
  { pinNumber: 17, label: "MDI1-", y: 0.2 },
  { pinNumber: 21, label: "MDI2+", y: -0.2 },
  { pinNumber: 18, label: "MDI2-", y: -0.6 },
  { pinNumber: 22, label: "MDI3+", y: -1 },
  { pinNumber: 19, label: "MDI3-", y: -1.4 },
] as const

const rightPorts = [
  { pinNumber: 11, label: "LED1A", y: 1.4 },
  { pinNumber: 12, label: "LED1K", y: 1 },
  { pinNumber: 13, label: "LED2A", y: 0.6 },
  { pinNumber: 14, label: "LED2K", y: 0.2 },
  { pinNumber: 25, label: "P9", y: -0.4 },
  { pinNumber: 26, label: "P10", y: -0.8 },
  { pinNumber: 23, label: "SH1", y: -1.2 },
  { pinNumber: 24, label: "SH2", y: -1.6 },
] as const

const Magjack = () => (
  <chip
    name="J_ETH"
    manufacturerPartNumber="HR911130A"
    pinLabels={pinLabels}
    schX={0}
    schY={0}
    symbol={
      <symbol>
        <schematicrect
          schX={0}
          schY={0}
          width={2.15}
          height={4}
          color="#880000"
          strokeWidth={0.1}
        />
        <schematictext
          text="4-PAIR MAGJACK"
          schX={0}
          schY={1.72}
          fontSize={0.16}
        />
        {leftPorts.map(({ label, y }) => (
          <schematictext
            text={label}
            schX={-0.95}
            schY={y}
            anchor="left"
            fontSize={0.16}
          />
        ))}
        {rightPorts.map(({ label, y }) => (
          <schematictext
            text={label}
            schX={0.95}
            schY={y}
            anchor="right"
            fontSize={0.16}
          />
        ))}
        {leftPorts.map(({ pinNumber, label, y }) => (
          <port
            name={`pin${pinNumber}`}
            pinNumber={pinNumber}
            aliases={[label]}
            direction="left"
            schX={-1.475}
            schY={y}
            schStemLength={0.4}
          />
        ))}
        {rightPorts.map(({ pinNumber, label, y }) => (
          <port
            name={`pin${pinNumber}`}
            pinNumber={pinNumber}
            aliases={[label]}
            direction="right"
            schX={1.475}
            schY={y}
            schStemLength={0.4}
          />
        ))}
      </symbol>
    }
  />
)

test("repro26: Ethernet pin names collide with connected net labels", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="12mm" height="12mm">
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
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson.filter((element) => element.type === "schematic_component"),
  ).toHaveLength(1)
  expect(
    circuitJson.filter((element) => element.type === "schematic_port"),
  ).toHaveLength(16)

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
