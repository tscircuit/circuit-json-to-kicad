import { expect, test } from "bun:test"
import type { SourceComponentBase, SourceNet, SourcePort } from "circuit-json"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { SmdUsbC } from "./assets/smd-usb-c-obj-only"

const InternallyConnectedPadNetsRepro = () => (
  <board width="14mm" height="10mm" routingDisabled schematicDisabled>
    <SmdUsbC name="J1" />
    <trace from=".J1 > .pin1" to="net.GND" />
  </board>
)

export default InternallyConnectedPadNetsRepro

const PadNetComparisonPcb = ({
  title,
  pad1Net,
  pad15Net,
}: {
  title: string
  pad1Net: string | null
  pad15Net: string | null
}) => (
  <board width="30mm" height="20mm" routingDisabled schematicDisabled>
    <SmdUsbC name="J1" pcbY={-1.5} />

    <pcbnotetext
      pcbX={0}
      pcbY={8.3}
      text={title}
      fontSize={0.8}
      anchorAlignment="center"
    />
    <pcbnotetext
      pcbX={-7}
      pcbY={5.2}
      text={`PAD 1: ${pad1Net ?? "UNASSIGNED"}`}
      fontSize={0.65}
      anchorAlignment="center"
      color={pad1Net === "GND" ? "#22c55e" : "#ef4444"}
    />
    <pcbnotetext
      pcbX={7}
      pcbY={5.2}
      text={`PAD 15: ${pad15Net ?? "UNASSIGNED"}`}
      fontSize={0.65}
      anchorAlignment="center"
      color={pad15Net === "GND" ? "#22c55e" : "#ef4444"}
    />
    <pcbnotetext
      pcbX={0}
      pcbY={-8.2}
      text="PADS 1 + 15: INTERNALLY CONNECTED"
      fontSize={0.52}
      anchorAlignment="center"
    />
  </board>
)

test("export nets for internally connected pads", async () => {
  const circuit = new Circuit()
  circuit.add(<InternallyConnectedPadNetsRepro />)
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const sourceComponent = circuitJson.find(
    (element) => element.type === "source_component" && element.name === "J1",
  ) as SourceComponentBase | undefined
  const sourcePorts = circuitJson.filter(
    (element) => element.type === "source_port",
  ) as SourcePort[]
  const internallyConnectedPinNumbers =
    sourceComponent?.internally_connected_source_port_ids?.map((group) =>
      group.map(
        (portId) =>
          sourcePorts.find((port) => port.source_port_id === portId)
            ?.pin_number,
      ),
    ) ?? []
  expect(internallyConnectedPinNumbers).toContainEqual([1, 15])

  const sourceGndNet = circuitJson.find(
    (element) => element.type === "source_net" && element.name === "GND",
  ) as SourceNet | undefined
  const sourcePin1 = sourcePorts.find((port) => port.pin_number === 1)
  const sourceGndTrace = circuitJson.find(
    (element) =>
      element.type === "source_trace" &&
      sourcePin1 !== undefined &&
      sourceGndNet !== undefined &&
      element.connected_source_port_ids.includes(sourcePin1.source_port_id) &&
      element.connected_source_net_ids.includes(sourceGndNet.source_net_id),
  )
  const sourcePad1Net = sourceGndTrace ? (sourceGndNet?.name ?? null) : null
  const sourcePad15Net = internallyConnectedPinNumbers.some(
    (group) => group.includes(1) && group.includes(15),
  )
    ? sourcePad1Net
    : null

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = KicadPcb.parse(output)[0] as KicadPcb
  const pads = pcb.footprints[0]!.fpPads.filter(
    (pad) => pad.number === "1" || pad.number === "15",
  )
  const padNets = pads.map((pad) => ({
    number: pad.number,
    net: pad.net?.name ?? null,
  }))

  expect(padNets).toMatchSnapshot()

  const exportedNetByPad = new Map(
    padNets.map(({ number, net }) => [number, net]),
  )
  const sourceVisualization = new Circuit()
  sourceVisualization.add(
    <PadNetComparisonPcb
      title="CIRCUIT JSON PAD NETS"
      pad1Net={sourcePad1Net}
      pad15Net={sourcePad15Net}
    />,
  )
  await sourceVisualization.renderUntilSettled()

  const kicadVisualization = new Circuit()
  kicadVisualization.add(
    <PadNetComparisonPcb
      title="KICAD-EXPORTED PAD NETS"
      pad1Net={exportedNetByPad.get("1") ?? null}
      pad15Net={exportedNetByPad.get("15") ?? null}
    />,
  )
  await kicadVisualization.renderUntilSettled()
  const kicadVisualizationConverter = new CircuitJsonToKicadPcbConverter(
    kicadVisualization.getCircuitJson(),
  )
  kicadVisualizationConverter.runUntilFinished()
  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: kicadVisualizationConverter.getOutputString(),
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
