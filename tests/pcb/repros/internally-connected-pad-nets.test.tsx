import { expect, test } from "bun:test"
import type { SourceComponentBase, SourcePort } from "circuit-json"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { SmdUsbC } from "./assets/smd-usb-c-obj-only"

const InternallyConnectedPadNetsRepro = () => (
  <board width="14mm" height="10mm" routingDisabled schematicDisabled>
    <SmdUsbC name="J1" />
    <trace from=".J1 > .pin1" to="net.GND" />
  </board>
)

export default InternallyConnectedPadNetsRepro

const createPadNetComparisonPng = async (
  rows: Array<{
    padNumber: string
    expectedNet: string
    kicadNet: string | null
  }>,
) => {
  const rowHeight = 64
  const rowsSvg = rows
    .map(({ padNumber, expectedNet, kicadNet }, index) => {
      const y = 156 + index * rowHeight
      const matches = kicadNet === expectedNet
      return `
        <rect x="24" y="${y - 36}" width="852" height="52" rx="8" fill="${matches ? "#ecfdf5" : "#fef2f2"}" />
        <text x="48" y="${y}" font-size="23" fill="#111827">Pad ${padNumber}</text>
        <text x="270" y="${y}" font-size="23" fill="#111827">${expectedNet}</text>
        <text x="520" y="${y}" font-size="23" fill="#111827">${kicadNet ?? "unassigned"}</text>
        <text x="810" y="${y}" font-size="19" font-weight="700" text-anchor="end" fill="${matches ? "#047857" : "#b91c1c"}">${matches ? "MATCH" : "MISSING"}</text>
      `
    })
    .join("")

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="${184 + rows.length * rowHeight}">
      <rect width="100%" height="100%" fill="#ffffff" />
      <text x="24" y="40" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#111827">Internally connected pad nets</text>
      <text x="24" y="72" font-family="Arial, sans-serif" font-size="17" fill="#4b5563">Expected from the TSX circuit vs. emitted in the KiCad footprint</text>
      <g font-family="Arial, sans-serif">
        <text x="48" y="108" font-size="17" font-weight="700" fill="#374151">PAD</text>
        <text x="270" y="108" font-size="17" font-weight="700" fill="#374151">TSX / CIRCUIT JSON</text>
        <text x="520" y="108" font-size="17" font-weight="700" fill="#374151">KICAD EXPORT</text>
        ${rowsSvg}
      </g>
    </svg>
  `

  return sharp(Buffer.from(svg)).png().toBuffer()
}

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
  await expect(
    createPadNetComparisonPng(
      padNets.map(({ number, net }) => ({
        padNumber: number,
        expectedNet: "GND",
        kicadNet: net,
      })),
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
