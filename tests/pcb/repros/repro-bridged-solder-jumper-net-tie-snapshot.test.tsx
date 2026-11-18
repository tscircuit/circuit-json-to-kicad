import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { getKicadPcbDrc } from "../../fixtures/get-kicad-pcb-drc"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { stackPngsVertically } from "../../fixtures/stackPngsVertically"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { BridgedSolderJumperBoard } from "./assets/bridged-solder-jumper-board"

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const getFirstSExpression = (source: string, prefix: string) => {
  const start = source.indexOf(prefix)
  if (start === -1) return `${prefix} ...) not exported`
  let depth = 0
  for (let i = start; i < source.length; i++) {
    if (source[i] === "(") depth++
    if (source[i] === ")") depth--
    if (depth === 0) return source.slice(start, i + 1).replace(/\s+/g, " ")
  }
  return source.slice(start).replace(/\s+/g, " ")
}

const renderTextPanel = async (lines: string[], width: number) => {
  const lineHeight = 22
  const height = lines.length * lineHeight + 24
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${lines
    .map(
      (line, i) =>
        `<text x="12" y="${28 + i * lineHeight}" font-family="monospace" font-size="15" fill="${line.startsWith("DRC") ? "#b91c1c" : "#111827"}">${escapeXml(line)}</text>`,
    )
    .join("\n  ")}
</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

// Shows what the exporter currently writes for a bridged jumper whose pads
// sit on different nets, and what KiCad DRC says about it.
test("bridged solder jumper KiCad export snapshot", async () => {
  const circuit = new Circuit()
  circuit.add(<BridgedSolderJumperBoard />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  const bridgeSegment = getFirstSExpression(output, "(segment")
  const drc = await getKicadPcbDrc(output)
  const sjViolations = drc.violations
    .filter(
      (violation) =>
        violation.type === "shorting_items" ||
        violation.type === "solder_mask_bridge",
    )
    .map((violation) => `DRC ${violation.type}: ${violation.description}`)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    pcbLayers: ["F.Cu", "F.Mask", "F.SilkS", "Edge.Cuts"],
  })
  const boards = await stackCircuitJsonKicadPngs(
    await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
    kicadSnapshot.generatedFileContent["temp_file.png"]!,
  )
  const { width = 800 } = await sharp(boards).metadata()
  const panel = await renderTextPanel(
    [
      "SJ1 solderjumper3_bridged12: pad1 = V5, pad2 = PUMP_V, pad3 = VEXT",
      "Exported bridge copper (a free board track, not footprint copper):",
      `  ${bridgeSegment.replace(/\s*\(uuid [^)]*\)/, "")}`,
      ...sjViolations,
    ],
    width,
  )

  await expect(stackPngsVertically([boards, panel])).toMatchPngSnapshot(
    import.meta.path,
  )
}, 30_000)
