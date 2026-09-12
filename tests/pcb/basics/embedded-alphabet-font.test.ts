import { expect, test } from "bun:test"
import base64Font from "@tscircuit/alphabet/base64font"
import type { CircuitJson, PcbSilkscreenText } from "circuit-json"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EmbeddedFile, EmbeddedFiles, parseKicadPcb } from "kicadts"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadModConverter,
} from "lib"
import { embedAlphabetFont } from "lib/fonts/embedAlphabetFont"
import simpleCircuit from "../../assets/simple-circuit.json"

const text: PcbSilkscreenText = {
  type: "pcb_silkscreen_text",
  pcb_silkscreen_text_id: "alphabet_text",
  pcb_component_id: "",
  text: "ABC 123",
  font: "tscircuit2024",
  font_size: 1,
  anchor_position: { x: 0, y: 0 },
  anchor_alignment: "center",
  layer: "top",
}

function convert(circuitJson: CircuitJson) {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  return converter
}

function expectFontPayload(output: string) {
  expect(output).toContain('(face "TscircuitAlphabet")')
  expect(output).toContain("(embedded_fonts yes)")
  expect(output.match(/\(name "TscircuitAlphabet.ttf"\)/g)).toHaveLength(1)
  expect(output).toContain("(type font)")
  const data = output.match(/\(data \|([\s\S]*?)\|\)/)![1]!.replace(/\s/g, "")
  const decoded = Buffer.from(
    Bun.zstdDecompressSync(Buffer.from(data, "base64")),
  )
  expect(decoded.equals(Buffer.from(base64Font, "base64"))).toBe(true)
  expect(output).toContain(
    `(checksum "${createHash("sha256").update(decoded).digest("hex")}")`,
  )
}

test("embeds the exact alphabet TTF once for multiple PCB texts", () => {
  const converter = convert([
    text,
    {
      ...text,
      pcb_silkscreen_text_id: "second",
      layer: "bottom",
      is_mirrored: true,
    },
  ])
  const output = converter.getOutputString()
  expectFontPayload(output)
  expect(output).toContain("mirror")
  expect(parseKicadPcb(output).embeddedFiles?.files).toHaveLength(1)
  expect(
    converter
      .getOutput()
      .graphicTexts.every((t) => t.effects?.font?.face === "TscircuitAlphabet"),
  ).toBe(true)
})

test("does not embed unused fonts", () => {
  expect(convert([]).getOutputString()).not.toContain("embedded_files")
  expect(convert([{ ...text, text: "" }]).getOutputString()).not.toContain(
    "embedded_files",
  )
})

test("preserves other embedded files and is idempotent", () => {
  const board = convert([text]).getOutput()
  const other = new EmbeddedFile({
    name: "note.txt",
    type: "other",
    data: "test",
  })
  board.embeddedFiles = new EmbeddedFiles({ files: [other] })
  embedAlphabetFont(board)
  embedAlphabetFont(board)
  expect(board.embeddedFiles.files).toHaveLength(2)
  expect(board.embeddedFiles.files[0]).toBe(other)
})

test("standalone footprint exports carry their own font", () => {
  const circuitJson = structuredClone(simpleCircuit) as CircuitJson
  const component = circuitJson.find((e) => e.type === "pcb_component")!
  if (component.type !== "pcb_component") throw new Error("Missing component")
  circuitJson.push({ ...text, pcb_component_id: component.pcb_component_id })
  const board = convert(circuitJson).getOutput()
  const footprint = board.footprints.find((fp) =>
    fp.fpTexts.some((t) => t.text === text.text),
  )!
  expect(footprint.embeddedFiles).toBeUndefined()
  const footprintName = footprint.libraryLink!.split(":").at(-1)!
  const converter = new CircuitJsonToKicadModConverter(circuitJson, {
    footprintName,
  })
  converter.runUntilFinished()
  expectFontPayload(converter.getOutputString())
})

test("KiCad loads the embedded font and plots filled glyph outlines", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kicad-alphabet-"))
  try {
    const input = join(dir, "board.kicad_pcb")
    const output = join(dir, "board.svg")
    await writeFile(input, convert([text]).getOutputString())
    const result = Bun.spawnSync([
      "kicad-cli",
      "pcb",
      "export",
      "svg",
      "--layers",
      "F.SilkS",
      "--mode-single",
      "--exclude-drawing-sheet",
      "-o",
      output,
      input,
    ])
    expect(result.exitCode).toBe(0)
    expect(result.stderr.toString()).not.toMatch(
      /Expecting|checksum|Error loading/i,
    )
    const svg = await readFile(output, "utf8")
    expect(svg).toContain("ABC 123")
    // The fallback KiCad stroke font produces open paths; the embedded TTF
    // must produce filled outlines, even without a system font installation.
    expect(svg).toContain("fill-rule:evenodd")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("fabrication and component notes select the embedded alphabet font", () => {
  const circuitJson = structuredClone(simpleCircuit) as CircuitJson
  const component = circuitJson.find((e) => e.type === "pcb_component")!
  if (component.type !== "pcb_component") throw new Error("Missing component")
  circuitJson.push(
    {
      type: "pcb_fabrication_note_text",
      pcb_fabrication_note_text_id: "fab",
      pcb_component_id: component.pcb_component_id,
      font: "tscircuit2024",
      font_size: 1,
      text: "FAB",
      layer: "top",
      anchor_position: { x: 0, y: 0 },
      anchor_alignment: "center",
    },
    {
      type: "pcb_note_text",
      pcb_note_text_id: "note",
      layer: "top",
      pcb_component_id: component.pcb_component_id,
      font: "tscircuit2024",
      font_size: 1,
      text: "NOTE",
      anchor_position: { x: 0, y: 0 },
      anchor_alignment: "center",
    },
  )
  const board = convert(circuitJson).getOutput()
  expect(
    board.graphicTexts.find((t) => t.text === "FAB")?.effects?.font?.face,
  ).toBe("TscircuitAlphabet")
  expect(
    board.footprints.flatMap((fp) => fp.fpTexts).find((t) => t.text === "NOTE")
      ?.effects?.font?.face,
  ).toBe("TscircuitAlphabet")
  expectFontPayload(board.getString())
})

test("restores valid embedded font serialization after parsing a board", () => {
  const board = parseKicadPcb(convert([text]).getOutputString())
  embedAlphabetFont(board)
  expectFontPayload(board.getString())
})
