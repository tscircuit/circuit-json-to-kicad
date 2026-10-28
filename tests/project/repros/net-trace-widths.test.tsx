import { expect, test } from "bun:test"
import { CircuitJsonToKicadProConverter } from "lib"
import sharp from "sharp"
import { Circuit } from "tscircuit"

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

const createNetWidthComparisonPng = async (
  rows: Array<{
    netName: string
    expectedWidth: number
    kicadClass: string
    kicadWidth: number
  }>,
) => {
  const rowHeight = 64
  const rowsSvg = rows
    .map(({ netName, expectedWidth, kicadClass, kicadWidth }, index) => {
      const y = 156 + index * rowHeight
      const matches = kicadWidth === expectedWidth
      return `
        <rect x="24" y="${y - 36}" width="852" height="52" rx="8" fill="${matches ? "#ecfdf5" : "#fef2f2"}" />
        <text x="48" y="${y}" font-size="23" fill="#111827">${netName}</text>
        <text x="310" y="${y}" font-size="23" fill="#111827">${expectedWidth} mm</text>
        <text x="490" y="${y}" font-size="21" fill="#111827">${kicadClass} (${kicadWidth} mm)</text>
        <text x="850" y="${y}" font-size="19" font-weight="700" text-anchor="end" fill="${matches ? "#047857" : "#b91c1c"}">${matches ? "MATCH" : "WRONG WIDTH"}</text>
      `
    })
    .join("")

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="${184 + rows.length * rowHeight}">
      <rect width="100%" height="100%" fill="#ffffff" />
      <text x="24" y="40" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#111827">Per-net trace widths</text>
      <text x="24" y="72" font-family="Arial, sans-serif" font-size="17" fill="#4b5563">Expected from the TSX circuit vs. the KiCad project routing rules</text>
      <g font-family="Arial, sans-serif">
        <text x="48" y="108" font-size="17" font-weight="700" fill="#374151">NET</text>
        <text x="310" y="108" font-size="17" font-weight="700" fill="#374151">TSX WIDTH</text>
        <text x="490" y="108" font-size="17" font-weight="700" fill="#374151">KICAD CLASS / WIDTH</text>
        ${rowsSvg}
      </g>
    </svg>
  `

  return sharp(Buffer.from(svg)).png().toBuffer()
}

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
  await expect(
    createNetWidthComparisonPng(
      sourceNets.map(({ name, trace_width }) => {
        const kicadClass = generatedNetClassAssignments?.[name] ?? "Default"
        return {
          netName: name,
          expectedWidth: trace_width,
          kicadClass,
          kicadWidth: classWidthByName.get(kicadClass) ?? 0,
        }
      }),
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
