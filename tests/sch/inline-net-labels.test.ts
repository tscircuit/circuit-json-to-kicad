import { expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CircuitJson } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { getInlineTraceNetLabels } from "lib/schematic/getInlineTraceNetLabels"
import fixture from "../fixtures/inline-net-labels.json"

test("automatic labels export as local electrical labels at wire ends", () => {
  const data = structuredClone(fixture) as CircuitJson
  const converter = new CircuitJsonToKicadSchConverter(data)
  converter.runUntilFinished()
  const sch = converter.getOutput()
  expect(sch.globalLabels).toHaveLength(0)
  expect(sch.labels).toHaveLength(2)
  expect(sch.labels.map((label) => label.value)).toEqual(["SIGNAL", "SIGNAL"])
  expect(sch.texts.some((text) => text.value === "SIGNAL")).toBe(false)
  // Both anchors must lie on the actual wire, not at the offset text position.
  const { labels } = getInlineTraceNetLabels(data)
  expect(labels.map((label) => label.anchor_position)).toEqual([
    { x: 1.06, y: 0 },
    { x: 3.9400000000000004, y: 0 },
  ])
})

test("trace annotations and text without source connectivity remain graphics", () => {
  const data = structuredClone(fixture) as CircuitJson
  for (const row of data) {
    if (row.type === "schematic_text") row.text = "Test point"
  }
  const converter = new CircuitJsonToKicadSchConverter(data)
  converter.runUntilFinished()
  expect(converter.getOutput().globalLabels).toHaveLength(0)
  expect(converter.getOutput().labels).toHaveLength(0)
  expect(
    converter.getOutput().texts.filter((t) => t.value === "Test point"),
  ).toHaveLength(2)
})

test("does not invent a label position when the source trace has no wire", () => {
  const data = fixture.filter(
    (r) => r.type !== "schematic_trace",
  ) as CircuitJson
  expect(getInlineTraceNetLabels(data).labels).toHaveLength(0)
})

// Read native connectivity, not just the converter's label objects or a render.
async function exportNativeNets(data: CircuitJson) {
  const converter = new CircuitJsonToKicadSchConverter(data)
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "root.kicad_sch",
  })
  const directory = await mkdtemp(join(tmpdir(), "inline-net-labels-"))
  try {
    for (const file of files) {
      await writeFile(join(directory, file.filename), file.content)
    }
    const netlistPath = join(directory, "netlist.xml")
    await $`kicad-cli sch export netlist --format kicadxml -o ${netlistPath} ${join(directory, "root.kicad_sch")}`.quiet()
    const xml = await readFile(netlistPath, "utf8")
    // These fixtures use simple ASCII net names and reference designators.
    return [
      ...xml.matchAll(/<net\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/net>/g),
    ].map(([, name, body]) => ({
      name,
      pins: [
        ...body!.matchAll(
          /<node\b[^>]*ref="([^"]*)"[^>]*pin="([^"]*)"[^>]*\/>/g,
        ),
      ]
        .map(([, reference, pin]) => `${reference}.${pin}`)
        .sort(),
    }))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("native KiCad connects the two inline-labelled pins on one sheet", async () => {
  const nets = await exportNativeNets(structuredClone(fixture) as CircuitJson)
  expect(nets.filter((net) => net.name?.endsWith("SIGNAL"))).toEqual([
    { name: "/SIGNAL", pins: ["R1.2", "R2.1"] },
  ])
}, 30_000)

function makeIndependentSheet(
  name: string,
  resistorOffset: number,
): CircuitJson {
  // Give each copy independent source IDs while retaining the same label text.
  const rows = JSON.parse(JSON.stringify(fixture), (key, value) => {
    if (key.endsWith("_id") || key === "subcircuit_connectivity_map_key") {
      return `${name}_${value}`
    }
    if (key.endsWith("_ids") && Array.isArray(value)) {
      return value.map((id) => `${name}_${id}`)
    }
    return value
  }) as CircuitJson
  for (const row of rows) {
    if (row.type.startsWith("schematic_")) {
      Object.assign(row, { schematic_sheet_id: name })
    }
    if (row.type === "source_component") {
      row.name = `R${Number(row.name.slice(1)) + resistorOffset}`
    }
  }
  return [
    {
      type: "schematic_sheet",
      schematic_sheet_id: name,
      name,
      sheet_index: resistorOffset,
    },
    ...rows,
  ]
}

test("native KiCad keeps same-named inline nets on different sheets separate", async () => {
  const nets = await exportNativeNets([
    ...makeIndependentSheet("First", 0),
    ...makeIndependentSheet("Second", 2),
  ])
  expect(nets.filter((net) => net.name?.endsWith("SIGNAL"))).toEqual([
    { name: "/First/SIGNAL", pins: ["R1.2", "R2.1"] },
    { name: "/Second/SIGNAL", pins: ["R3.2", "R4.1"] },
  ])
}, 30_000)

test("explicit net labels retain their existing global scope", () => {
  const data = fixture.filter(
    (row) => row.type !== "schematic_text",
  ) as CircuitJson
  data.push(...getInlineTraceNetLabels(fixture as CircuitJson).labels)
  const converter = new CircuitJsonToKicadSchConverter(data)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  expect(schematic.labels).toHaveLength(0)
  expect(schematic.globalLabels.map((label) => label.value)).toEqual([
    "SIGNAL",
    "SIGNAL",
  ])
})
