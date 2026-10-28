import { expect, test } from "bun:test"
import { CircuitJsonToKicadProConverter } from "lib"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Fragment } from "react"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const NetTraceWidthsRepro = () => (
  <board
    width="20mm"
    height="20mm"
    routingDisabled
    minViaPadDiameter="0.6mm"
    minViaHoleDiameter="0.3mm"
  >
    <net name="MOTOR_PHASE" nominalTraceWidth="2mm" />
    <net name="LOGIC_3V3" nominalTraceWidth="0.3mm" />
  </board>
)

export default NetTraceWidthsRepro

type NetWidthResult = {
  netName: string
  expectedWidth: number
  kicadClass: string
  kicadWidth: number
}

const NetWidthCoupon = ({
  rows,
  widthSource,
}: {
  rows: NetWidthResult[]
  widthSource: "circuit-json" | "kicad"
}) => (
  <board width="30mm" height="20mm" schematicDisabled>
    <pcbnotetext
      pcbX={0}
      pcbY={8.3}
      text={
        widthSource === "circuit-json"
          ? "AUTHORED CIRCUIT JSON NET WIDTHS"
          : "KICAD PROJECT REROUTE WIDTHS"
      }
      fontSize={0.8}
      anchorAlignment="center"
    />
    {rows.map(({ netName, expectedWidth, kicadClass, kicadWidth }, index) => {
      const y = index === 0 ? 3 : -4
      const matches = kicadWidth === expectedWidth
      const displayedWidth =
        widthSource === "circuit-json" ? expectedWidth : kicadWidth
      const leftRef = `${netName}_LEFT`
      const rightRef = `${netName}_RIGHT`

      return (
        <Fragment key={netName}>
          <resistor
            name={leftRef}
            resistance="0ohm"
            footprint="0402"
            pcbX={-11}
            pcbY={y}
          />
          <resistor
            name={rightRef}
            resistance="0ohm"
            footprint="0402"
            pcbX={11}
            pcbY={y}
          />
          <trace
            from={`.${leftRef} > .pin1`}
            to={`.${rightRef} > .pin1`}
            thickness={`${displayedWidth}mm`}
          />
          <pcbnotetext
            pcbX={0}
            pcbY={y + 2.1}
            text={
              widthSource === "circuit-json"
                ? `${netName}: ${expectedWidth}mm`
                : `${netName}: ${kicadWidth}mm (${kicadClass})`
            }
            fontSize={0.62}
            anchorAlignment="center"
            color={
              widthSource === "kicad" && !matches ? "#ef4444" : "#22c55e"
            }
          />
        </Fragment>
      )
    })}
    <pcbnotetext
      pcbX={0}
      pcbY={-8.2}
      text={
        widthSource === "circuit-json"
          ? "SOURCE RULES: MOTOR 2mm / LOGIC 0.3mm"
          : rows.every(({ expectedWidth, kicadWidth }) =>
                Object.is(expectedWidth, kicadWidth),
              )
            ? "KICAD NET CLASSES MATCH AUTHORED WIDTHS"
            : "KICAD REROUTES BOTH NETS AT THE DEFAULT WIDTH"
      }
      fontSize={0.52}
      anchorAlignment="center"
    />
  </board>
)

test("repro: source net trace widths are omitted from KiCad net settings", async () => {
  const circuit = new Circuit()
  circuit.add(<NetTraceWidthsRepro />)
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: "net-trace-width-repro",
  })
  const sourceNets = circuitJson
    .filter((element) => element.type === "source_net")
    .map(({ name, trace_width }) => ({ name, trace_width }))
    .filter(
      (net): net is { name: string; trace_width: number } =>
        net.trace_width !== undefined,
    )
  const generatedNetSettings = converter.getOutput().net_settings
  const generatedNetClassAssignments = (
    generatedNetSettings as typeof generatedNetSettings & {
      netclass_assignments?: Record<string, string>
    }
  ).netclass_assignments

  expect({
    sourceNets,
    generatedNetSettings,
  }).toMatchSnapshot()

  const classWidthByName = new Map(
    generatedNetSettings.classes.map(({ name, track_width }) => [
      name,
      track_width,
    ]),
  )
  const widthResults = sourceNets.map(({ name, trace_width }) => {
    const kicadClass = generatedNetClassAssignments?.[name] ?? "Default"
    return {
      netName: name,
      expectedWidth: trace_width,
      kicadClass,
      kicadWidth: classWidthByName.get(kicadClass) ?? 0,
    }
  })

  const sourceVisualization = new Circuit()
  sourceVisualization.add(
    <NetWidthCoupon rows={widthResults} widthSource="circuit-json" />,
  )
  await sourceVisualization.renderUntilSettled()

  const kicadVisualization = new Circuit()
  kicadVisualization.add(
    <NetWidthCoupon rows={widthResults} widthSource="kicad" />,
  )
  await kicadVisualization.renderUntilSettled()
  const kicadPcbConverter = new CircuitJsonToKicadPcbConverter(
    kicadVisualization.getCircuitJson(),
  )
  kicadPcbConverter.runUntilFinished()
  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: kicadPcbConverter.getOutputString(),
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
  })

  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson: sourceVisualization.getCircuitJson(),
        outputType: "pcb",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
