import { expect, test } from "bun:test"
import { CircuitJsonToKicadProConverter } from "lib"
import { Fragment } from "react"
import { Circuit } from "tscircuit"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"

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

const ExportedNetWidthPcb = ({ rows }: { rows: NetWidthResult[] }) => (
  <board width="30mm" height="20mm" routingDisabled schematicDisabled>
    <pcbnotetext
      pcbX={0}
      pcbY={8.3}
      text="COPPER WIDTHS FROM KICAD PROJECT RULES"
      fontSize={0.8}
      anchorAlignment="center"
    />
    <chip
      name="U_WIDTHS"
      footprint={
        <footprint>
          {rows.map(({ netName, kicadWidth }, index) => (
            <Fragment key={netName}>
              <smtpad
                portHints={[`${index + 1}`]}
                pcbY={index === 0 ? 3 : -4}
                width="22mm"
                height={`${kicadWidth}mm`}
                shape="rect"
              />
            </Fragment>
          ))}
        </footprint>
      }
    />
    {rows.map(({ netName, expectedWidth, kicadWidth }, index) => (
      <Fragment key={netName}>
        <pcbnotetext
          pcbX={0}
          pcbY={(index === 0 ? 3 : -4) + 2.1}
          text={`${netName}: REQUESTED ${expectedWidth}mm | KICAD ${kicadWidth}mm`}
          fontSize={0.62}
          anchorAlignment="center"
          color={kicadWidth === expectedWidth ? "#22c55e" : "#ef4444"}
        />
      </Fragment>
    ))}
    <pcbnotetext
      pcbX={0}
      pcbY={-8.2}
      text="THE DRAWN COPPER USES THE WIDTH KICAD WILL APPLY WHEN REROUTING"
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

  const visualizationCircuit = new Circuit()
  visualizationCircuit.add(<ExportedNetWidthPcb rows={widthResults} />)
  await visualizationCircuit.renderUntilSettled()

  await expect(
    takeCircuitJsonSnapshot({
      circuitJson: visualizationCircuit.getCircuitJson(),
      outputType: "pcb",
      pcbSvgOptions: {
        viewport: { minX: -16, minY: -11, maxX: 16, maxY: 11 },
        drawPaddingOutsideBoard: false,
      },
    }),
  ).toMatchPngSnapshot(import.meta.path)
})
