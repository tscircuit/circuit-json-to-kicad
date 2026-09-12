import { expect, test } from "bun:test"
import type { AnyCircuitElement, PcbSilkscreenText } from "circuit-json"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createCircuitJsonTextFont } from "lib/utils/create-circuit-json-text-font"
import { createGrTextFromCircuitJson } from "lib/pcb/stages/utils/CreateGrTextFromCircuitJson"
import { createFpTextFromCircuitJson } from "lib/pcb/stages/utils/CreateFpTextFromCircuitJson"
import { At } from "kicadts"
import { identity } from "transformation-matrix"

const label = "SN74LVC1G17DCKR"
const text = (value = label): PcbSilkscreenText => ({
  type: "pcb_silkscreen_text",
  pcb_silkscreen_text_id: "text_0",
  pcb_component_id: "",
  font: "tscircuit2024",
  text: value,
  font_size: 0.8,
  layer: "top",
  anchor_position: { x: 0, y: 0 },
  anchor_alignment: "center",
})

test("fits the issue #4719 label without reducing native text height", () => {
  const font = createCircuitJsonTextFont(text())
  expect(font.size?.height).toBe(0.8)
  expect(font.size?.width).toBeCloseTo(0.489157, 5)
  expect(font.thickness).toBe(0.08)
})

test("accounts for glyph widths, multiline text and stroke limits", () => {
  const wide = createCircuitJsonTextFont(text("WWW"))
  const narrow = createCircuitJsonTextFont(text("iii"))
  expect(wide.size!.width).toBeLessThan(narrow.size!.width!)
  expect(narrow.size!.width).toBe(0.8)
  expect(createCircuitJsonTextFont(text(`iii\n${label}`)).size).toEqual(
    createCircuitJsonTextFont(text()).size,
  )
  for (const value of ["W", "A", "R1", "10kΩ", "µF", "日本語", "", "\n"]) {
    const font = createCircuitJsonTextFont(text(value))
    expect(font.size!.width).toBeGreaterThan(0)
    expect(font.size!.height).toBe(0.8)
    expect(font.thickness).toBeLessThanOrEqual(font.size!.width! / 4)
    expect(font.thickness).toBeLessThanOrEqual(0.1)
  }
  const small = createCircuitJsonTextFont({ ...text(), font_size: 0.2 })
  expect(small.size!.height).toBe(0.2)
  expect(small.thickness).toBe(0.02)
})

test("board and footprint text share font metrics and preserve mirror/anchor/rotation", () => {
  const input: PcbSilkscreenText = {
    ...text(),
    layer: "bottom",
    ccw_rotation: 90,
    anchor_alignment: "top_left",
    anchor_position: { x: 2, y: 3 },
  }
  const boardText = createGrTextFromCircuitJson({
    textElement: input,
    c2kMatPcb: identity(),
  })!
  const footprintText = createFpTextFromCircuitJson({
    textElement: input,
    componentCenter: { x: 0, y: 0 },
  })!
  for (const element of [boardText, footprintText]) {
    expect(element.effects!.font!.size).toEqual(
      createCircuitJsonTextFont(input).size,
    )
    expect(element.effects!.justify!.mirror).toBe(true)
    expect(element.effects!.justify!.horizontal).toBe("left")
    expect(element.effects!.justify!.vertical).toBe("top")
    expect((element.position as At).angle).toBe(90)
  }
})

async function getDrcTypes(circuitJson: AnyCircuitElement[], legacy = false) {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  let output = converter.getOutputString()
  if (legacy) {
    // Positive control: the same board with the old font settings must fail.
    output = output.replace(
      /\(font\s+\(size [^)]*\)\s+\(thickness [^)]*\)/g,
      "(font (size 0.8 0.8) (thickness 0.15)",
    )
  }
  const dir = await mkdtemp(join(tmpdir(), "kicad-text-metrics-"))
  try {
    const pcbPath = join(dir, "repro.kicad_pcb")
    const reportPath = join(dir, "drc.json")
    await writeFile(pcbPath, output)
    const command = Bun.spawn(
      [
        "kicad-cli",
        "pcb",
        "drc",
        "--format",
        "json",
        "--output",
        reportPath,
        pcbPath,
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    const [exitCode, stderr] = await Promise.all([
      command.exited,
      new Response(command.stderr).text(),
      new Response(command.stdout).text(),
    ])
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
    const report = JSON.parse(await readFile(reportPath, "utf8"))
    return report.violations.map((v: { type: string }) => v.type) as string[]
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function board(width: number): AnyCircuitElement {
  return {
    type: "pcb_board",
    pcb_board_id: "board_0",
    width,
    height: width,
    center: { x: 0, y: 0 },
    num_layers: 2,
    thickness: 1.6,
  } as AnyCircuitElement
}

for (const kind of ["standalone", "footprint"] as const) {
  test(`native KiCad: ${kind} label no longer clips the board edge`, async () => {
    const json: AnyCircuitElement[] = [board(10.4)]
    const input = text()
    if (kind === "footprint") {
      json.push(
        {
          type: "source_component",
          source_component_id: "source_0",
          name: "U1",
          ftype: "simple_chip",
        },
        {
          type: "pcb_component",
          pcb_component_id: "component_0",
          source_component_id: "source_0",
          center: { x: 0, y: 0 },
          width: 1,
          height: 1,
          rotation: 0,
          layer: "top",
        } as AnyCircuitElement,
      )
      input.pcb_component_id = "component_0"
    }
    json.push(input)
    expect(await getDrcTypes(json, true)).toContain("silk_edge_clearance")
    expect(await getDrcTypes(json)).not.toContain("silk_edge_clearance")
  }, 60_000)
}

test("native KiCad: adjacent labels no longer overlap", async () => {
  const json: AnyCircuitElement[] = [
    board(30),
    { ...text(), anchor_position: { x: -4.2, y: 0 } },
    {
      ...text(),
      pcb_silkscreen_text_id: "text_1",
      anchor_position: { x: 4.2, y: 0 },
    },
  ]
  expect(await getDrcTypes(json, true)).toContain("silk_overlap")
  const types = await getDrcTypes(json)
  expect(types).not.toContain("silk_overlap")
  expect(types).not.toContain("silk_edge_clearance")
}, 60_000)
