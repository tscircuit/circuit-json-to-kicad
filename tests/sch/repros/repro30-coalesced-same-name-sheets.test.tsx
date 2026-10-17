import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import { partitionCircuitJsonBySheet } from "lib/schematic/partitionCircuitJsonBySheet"
import { getCoalescedTraceNetLabels } from "lib/schematic/stages/utils/getCoalescedTraceNetLabels"
import { createCoalescedNetCircuit } from "../../fixtures/create-coalesced-net-circuit"

test("same-name coalesced nets join within each sheet without crossing sheets", async () => {
  const circuitJson = await createCoalescedNetCircuit([
    {
      name: "analog_scope",
      sheetName: "Analog",
      pairs: [
        { firstRef: "R1", firstPin: 2, secondRef: "R2", secondPin: 1, x: 0 },
        {
          firstRef: "R3",
          firstPin: 2,
          secondRef: "R4",
          secondPin: 1,
          x: 20,
        },
      ],
    },
    {
      name: "digital_scope",
      sheetName: "Digital",
      pairs: [
        {
          firstRef: "R5",
          firstPin: 2,
          secondRef: "R6",
          secondPin: 1,
          x: 40,
        },
        {
          firstRef: "R7",
          firstPin: 2,
          secondRef: "R8",
          secondPin: 1,
          x: 60,
        },
      ],
    },
  ])
  const sourceNets = circuitJson.filter(
    (element) => element.type === "source_net" && element.name === "SIGNAL",
  )
  const syntheticWires = circuitJson.filter(
    (
      element,
    ): element is Extract<CircuitJson[number], { type: "schematic_trace" }> =>
      element.type === "schematic_trace" &&
      (element.source_trace_id?.startsWith("schematic_port_") ?? false),
  )
  expect(sourceNets).toHaveLength(2)
  expect(syntheticWires).toHaveLength(4)
  expect(
    new Set(syntheticWires.map((wire) => wire.schematic_sheet_id)),
  ).toEqual(new Set(["schematic_sheet_0", "schematic_sheet_1"]))
  const perSheetLabelCount = ["schematic_sheet_0", "schematic_sheet_1"].reduce(
    (count, sheetId) =>
      count +
      getCoalescedTraceNetLabels(
        partitionCircuitJsonBySheet(circuitJson, sheetId),
      ).length,
    0,
  )
  expect(perSheetLabelCount).toBe(4)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const schematicFiles = converter.getOutputFiles({
    schematicFilename: "project.kicad_sch",
  })
  const tempDir = await mkdtemp(join(tmpdir(), "coalesced-sheets-"))
  try {
    for (const file of schematicFiles) {
      await writeFile(join(tempDir, file.filename), file.content)
    }
    const schematicPath = join(tempDir, "project.kicad_sch")
    const netlistPath = join(tempDir, "same-name-sheets.xml")
    const result = Bun.spawnSync([
      "kicad-cli",
      "sch",
      "export",
      "netlist",
      "--format",
      "kicadxml",
      "--output",
      netlistPath,
      schematicPath,
    ])
    expect(result.exitCode).toBe(0)
    const netlist = await readFile(netlistPath, "utf8")
    const componentRefs = [...netlist.matchAll(/<comp ref="([^"]+)"/g)]
      .map(([, ref]) => ref!)
      .sort()
    expect(componentRefs).toEqual([
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
      "R6",
      "R7",
      "R8",
    ])
    const netPartition = [...netlist.matchAll(/<net\b[^>]*>([\s\S]*?)<\/net>/g)]
      .map(([, body]) =>
        [...body!.matchAll(/<node\b[^>]*ref="([^"]+)"[^>]*pin="([^"]+)"/g)]
          .map(([, ref, pin]) => `${ref}.${pin}`)
          .sort(),
      )
      .filter((members) => members.length > 0)
      .sort((a, b) => a.join(",").localeCompare(b.join(",")))
    expect(netPartition).toEqual([
      ["R1.1"],
      ["R1.2", "R2.1", "R3.2", "R4.1"],
      ["R2.2"],
      ["R3.1"],
      ["R4.2"],
      ["R5.1"],
      ["R5.2", "R6.1", "R7.2", "R8.1"],
      ["R6.2"],
      ["R7.1"],
      ["R8.2"],
    ])
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}, 120_000)
