import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { fp } from "@tscircuit/footprinter"
import type { CircuitJson } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { KicadFootprintToCircuitJsonConverter } from "kicad-to-circuit-json"
import { CircuitJsonToKicadModConverter } from "lib/footprint/CircuitJsonToKicadModConverter"
import { createSideBySideSvg } from "../fixtures/create-side-by-side-svg"

async function expectSvgSnapshot(
  svg: string,
  testPathOriginal: string,
): Promise<void> {
  const testPath = testPathOriginal.replace(/\.test\.tsx?$/u, "")
  const snapshotPath = join(
    dirname(testPath),
    "__snapshots__",
    `${basename(testPath)}.snap.svg`,
  )
  const updateSnapshot =
    process.argv.includes("--update-snapshots") ||
    process.argv.includes("-u") ||
    Boolean(process.env.BUN_UPDATE_SNAPSHOTS)

  if (!existsSync(snapshotPath) || updateSnapshot) {
    await mkdir(dirname(snapshotPath), { recursive: true })
    await writeFile(snapshotPath, svg)
    expect(existsSync(snapshotPath)).toBe(true)
    return
  }

  const existingSnapshot = await readFile(snapshotPath, "utf8")
  expect(svg).toBe(existingSnapshot)
}

test("CircuitJsonToKicadModConverter converts standalone footprint circuit json to .kicad_mod", async () => {
  const standaloneFootprintCircuitJson = fp
    .string("soic8")
    .circuitJson() as CircuitJson

  expect(
    standaloneFootprintCircuitJson.some((el) => el.type === "pcb_component"),
  ).toBe(false)

  const converter = new CircuitJsonToKicadModConverter(
    standaloneFootprintCircuitJson,
    {
      footprintName: "SOIC-8",
    },
  )
  converter.runUntilFinished()

  const output = converter.getOutput()
  expect(output.footprintName).toBe("SOIC-8")

  const kicadModString = converter.getOutputString()
  expect(kicadModString).toContain('"SOIC-8"')
  expect(kicadModString).toContain('(property "Reference" "REF**"')
  expect(kicadModString).toContain('(pad "1" smd roundrect')
  expect(kicadModString).toContain('(pad "8" smd roundrect')
  expect(kicadModString).toContain("(fp_line")
  expect(kicadModString).toContain("(fp_poly")
  expect(kicadModString).not.toContain('"{REF}"')

  const kicadToCircuitJson = new KicadFootprintToCircuitJsonConverter()
  kicadToCircuitJson.addFile("SOIC-8.kicad_mod", kicadModString)
  kicadToCircuitJson.runUntilFinished()
  const roundTrippedCircuitJson = kicadToCircuitJson.getOutput() as CircuitJson

  expect(
    roundTrippedCircuitJson.filter((el) => el.type === "pcb_smtpad"),
  ).toHaveLength(8)

  const sourceSvg = convertCircuitJsonToPcbSvg(
    standaloneFootprintCircuitJson.filter(
      (el: any) => !(el.type === "pcb_silkscreen_text" && el.text === "{REF}"),
    ) as CircuitJson,
    { showCourtyards: true },
  )
  const convertedSvg = convertCircuitJsonToPcbSvg(roundTrippedCircuitJson, {
    showCourtyards: true,
  })

  const sideBySideSvg = createSideBySideSvg(sourceSvg, convertedSvg)
  await expectSvgSnapshot(sideBySideSvg, import.meta.path)
})

test("CircuitJsonToKicadModConverter renames single-component circuit json when footprintName is provided", () => {
  const singleComponentCircuitJson: CircuitJson = [
    {
      type: "source_component",
      source_component_id: "source_component_1",
      name: "U1",
      ftype: "simple_chip",
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_component_1",
      source_component_id: "source_component_1",
      center: { x: 0, y: 0 },
      width: 4,
      height: 4,
      layer: "top",
      rotation: 0,
      obstructs_within_bounds: false,
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pcb_smtpad_1",
      pcb_component_id: "pcb_component_1",
      shape: "rect",
      x: -1.5,
      y: 0,
      width: 1,
      height: 1.5,
      layer: "top",
      port_hints: ["1"],
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pcb_smtpad_2",
      pcb_component_id: "pcb_component_1",
      shape: "rect",
      x: 1.5,
      y: 0,
      width: 1,
      height: 1.5,
      layer: "top",
      port_hints: ["2"],
    },
  ]

  const converter = new CircuitJsonToKicadModConverter(
    singleComponentCircuitJson,
    {
      footprintName: "CustomDualPad",
    },
  )
  converter.runUntilFinished()

  const output = converter.getOutput()
  expect(output.footprintName).toBe("CustomDualPad")
  expect(output.kicadModString).toContain('"CustomDualPad"')
})
