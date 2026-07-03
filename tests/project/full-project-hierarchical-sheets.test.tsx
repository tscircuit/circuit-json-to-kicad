import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { parseKicadSch } from "kicadts"
import {
  CircuitJsonToKicadProConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { $ } from "bun"
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("full hierarchical project: .kicad_pro sheets match .kicad_sch and kicad opens it", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="60mm" height="60mm" routingDisabled>
      <schematicsheet name="Power" displayName="Power" sheetIndex={0}>
        <resistor
          name="R1"
          resistance="10k"
          footprint="0402"
          schX={0}
          schY={0}
        />
      </schematicsheet>
      <schematicsheet name="Logic" displayName="Logic" sheetIndex={1}>
        <chip name="U1" footprint="soic8" schX={0} schY={0} />
      </schematicsheet>
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
  schConverter.runUntilFinished()
  const schematicFiles = schConverter.getOutputFiles({
    schematicFilename: "proj.kicad_sch",
  })

  const proConverter = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: "proj",
    schematicFilename: "proj.kicad_sch",
    pcbFilename: "proj.kicad_pcb",
    schematicSheetPlan: schConverter.schematicSheetPlan,
  })
  proConverter.runUntilFinished()
  const pro = JSON.parse(proConverter.getOutputString())

  // The .kicad_pro sheets list uses the same UUIDs as the .kicad_sch hierarchy.
  const root = parseKicadSch(schematicFiles[0]!.content)
  const rootUuid = root.uuid!.value
  const sheetNodeUuids = root.sheets.map((s) => s.uuid!.value)

  expect(pro.sheets[0]).toEqual([rootUuid, "Root"])
  expect(pro.sheets.map((s: [string, string]) => s[0])).toEqual([
    rootUuid,
    ...sheetNodeUuids,
  ])
  expect(pro.sheets.map((s: [string, string]) => s[1])).toEqual([
    "Root",
    "Power",
    "Logic",
  ])

  // And kicad-cli opens/renders the whole project without error.
  const dir = await mkdtemp(join(tmpdir(), "kicad-proj-"))
  try {
    for (const f of schematicFiles)
      await writeFile(join(dir, f.filename), f.content)
    await writeFile(join(dir, "proj.kicad_pro"), proConverter.getOutputString())
    const outDir = join(dir, "out")
    const res =
      await $`kicad-cli sch export svg ${join(dir, "proj.kicad_sch")} -o ${outDir} --theme Modern`.quiet()
    expect(res.exitCode).toBe(0)
    const svgs = (await readdir(outDir)).filter((f) => f.endsWith(".svg"))
    expect(svgs.length).toBe(3)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)
