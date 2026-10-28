import { expect, test } from "bun:test"
import type { SourceComponentBase, SourcePort } from "circuit-json"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { SmdUsbC } from "./assets/smd-usb-c-obj-only"

const InternallyConnectedPadNetsRepro = () => (
  <board width="14mm" height="10mm" routingDisabled schematicDisabled>
    <SmdUsbC name="J1" />
    <trace from=".J1 > .pin1" to="net.GND" />
  </board>
)

export default InternallyConnectedPadNetsRepro

const ExportedPadNetPcb = ({
  pad1Net,
  pad15Net,
}: {
  pad1Net: string | null
  pad15Net: string | null
}) => (
  <board width="20mm" height="15mm" routingDisabled schematicDisabled>
    <SmdUsbC name="J1" pcbY={-2} />

    <pcbnotetext
      pcbX={0}
      pcbY={6.2}
      text="KICAD-EXPORTED PAD NETS"
      fontSize={0.8}
      anchorAlignment="center"
    />
    <pcbnotetext
      pcbX={-5.8}
      pcbY={3.8}
      text={`PAD 1: ${pad1Net ?? "UNASSIGNED"}`}
      fontSize={0.65}
      anchorAlignment="center"
      color={pad1Net === "GND" ? "#22c55e" : "#ef4444"}
    />
    <pcbnoteline
      x1={-5.8}
      y1={3.2}
      x2={-3.35}
      y2={0.45}
      strokeWidth={0.18}
      color={pad1Net === "GND" ? "#22c55e" : "#ef4444"}
    />
    <pcbnotetext
      pcbX={5.8}
      pcbY={3.8}
      text={`PAD 15: ${pad15Net ?? "UNASSIGNED"}`}
      fontSize={0.65}
      anchorAlignment="center"
      color={pad15Net === "GND" ? "#22c55e" : "#ef4444"}
    />
    <pcbnoteline
      x1={5.8}
      y1={3.2}
      x2={3.35}
      y2={0.45}
      strokeWidth={0.18}
      color={pad15Net === "GND" ? "#22c55e" : "#ef4444"}
    />
    <pcbnotetext
      pcbX={0}
      pcbY={-6}
      text="PADS 1 + 15 ARE INTERNALLY CONNECTED; BOTH SHOULD BE GND"
      fontSize={0.55}
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
  const visualizationCircuit = new Circuit()
  visualizationCircuit.add(
    <ExportedPadNetPcb
      pad1Net={exportedNetByPad.get("1") ?? null}
      pad15Net={exportedNetByPad.get("15") ?? null}
    />,
  )
  await visualizationCircuit.renderUntilSettled()

  await expect(
    takeCircuitJsonSnapshot({
      circuitJson: visualizationCircuit.getCircuitJson(),
      outputType: "pcb",
    }),
  ).toMatchPngSnapshot(import.meta.path)
})
