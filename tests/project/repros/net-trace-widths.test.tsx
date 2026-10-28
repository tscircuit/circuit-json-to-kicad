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
  <board width="30mm" height="20mm" schematicDisabled>
    <pcbnotetext
      pcbX={0}
      pcbY={8.3}
      text="COPPER WIDTHS FROM KICAD PROJECT RULES"
      fontSize={0.8}
      anchorAlignment="center"
    />
    {rows.map(({ netName, expectedWidth, kicadClass, kicadWidth }, index) => {
      const y = index === 0 ? 3 : -4
      const matches = kicadWidth === expectedWidth
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
            thickness={`${kicadWidth}mm`}
          />
          <pcbnotetext
            pcbX={0}
            pcbY={y + 2.1}
            text={`${netName}: TSX ${expectedWidth}mm -> KICAD ${kicadWidth}mm (${kicadClass})`}
            fontSize={0.62}
            anchorAlignment="center"
            color={matches ? "#22c55e" : "#ef4444"}
          />
        </Fragment>
      )
    })}
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
    }),
  ).toMatchPngSnapshot(import.meta.path)
})
