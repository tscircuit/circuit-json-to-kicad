import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../../lib"
import { expectOpenSourceSvgSnapshot } from "../../fixtures/create-open-source-schematic-svg-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro4948: HDMI EDID preserves 110 components and all 98 MPN fields on export", async () => {
  const filename = "hdmi-edid-debug-board.kicad_pcb"
  const sourceText = await readFile(resolve("references", filename), "utf8")
  const source = parseKicadPcb(sourceText)
  const importer = new KicadToCircuitJsonConverter()
  importer.addFile(filename, sourceText)
  importer.runUntilFinished()
  const circuitJson = importer.getOutput()
  const components = circuitJson.filter(
    (item) => item.type === "source_component",
  )
  expect(components).toHaveLength(110)
  expect(
    components.filter((item) => item.manufacturer_part_number),
  ).toHaveLength(98)

  const exporter = new CircuitJsonToKicadPcbConverter(circuitJson)
  exporter.runUntilFinished()
  const outputText = exporter.getOutputString()
  const output = parseKicadPcb(outputText)
  const properties = (footprint: (typeof source.footprints)[number]) =>
    Object.fromEntries(
      footprint.properties.map((property) => [property.key, property.value]),
    )
  const sourceParts = source.footprints.map(properties)
  const outputParts = output.footprints.map(properties)
  const originalMpns = sourceParts.filter((part) => part.MPN)
  const exportedMpns = outputParts.filter((part) => part.MPN)
  expect(originalMpns).toHaveLength(98)
  expect(output.footprints).toHaveLength(source.footprints.length)
  expect(exportedMpns).toHaveLength(originalMpns.length)
  for (const part of sourceParts) {
    const component = components.find((item) => item.name === part.Reference)
    const converted = outputParts.find(
      (item) => item.Reference === part.Reference,
    )
    expect(component).toBeDefined()
    expect(converted).toBeDefined()
    expect(component!.manufacturer_part_number).toBe(part.MPN || undefined)
    expect(converted!.MPN).toBe(part.MPN || undefined)
  }
  const reimporter = new KicadToCircuitJsonConverter()
  reimporter.addFile(filename, outputText)
  reimporter.runUntilFinished()
  expect(
    reimporter
      .getOutput()
      .filter(
        (item) =>
          item.type === "source_component" && item.manufacturer_part_number,
      ),
  ).toHaveLength(98)

  const samples = ["R11", "Q1", "J5"].map((reference) => ({
    original: sourceParts.find((part) => part.Reference === reference)!,
    converted: outputParts.find((part) => part.Reference === reference)!,
  }))
  // A resistor's Value must not be replaced with its manufacturer part number.
  expect(samples[0]!.converted.Value).not.toBe(samples[0]!.original.MPN)

  const snapshots = await Promise.all(
    [sourceText, outputText].map((content) =>
      takeKicadSnapshot({
        kicadFileContent: content,
        kicadFileType: "pcb",
        generatePng: false,
        pcbDrillHoleColor: "white",
        pcbCopperPourOpacity: 0.35,
      }),
    ),
  )
  const panels = snapshots.map((snapshot, index) => {
    const svg = snapshot.generatedFileContent["temp_file.svg"]!.toString()
    const viewBox = svg.match(/\bviewBox="([^"]+)"/)?.[1]
    if (!viewBox) throw new Error("Board snapshot has no viewBox")
    const contents = svg
      .replace(/^[\s\S]*?<svg\b[^>]*>/, "")
      .replace(/<\/svg>\s*$/, "")
      .replace(
        / date \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} /g,
        " date normalized ",
      )
      .replace(/[ \t]+$/gm, "")
    return `<svg data-comparison="${index ? "converted" : "source"}" x="${24 + index * 708}" y="128" width="684" height="490" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${contents}</svg>`
  })
  const lost = originalMpns.length - exportedMpns.length
  const color = lost ? "#ff8585" : "#8fd6a7"
  const escapeXml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
  const rows = samples
    .map(
      ({ original, converted }, index) =>
        `<text x="40" y="${678 + index * 34}">${escapeXml(original.Reference!)}: ${escapeXml(original.MPN!)}</text>
<text x="748" y="${678 + index * 34}" fill="${color}">${escapeXml(converted.Reference!)}: ${escapeXml(converted.MPN || "MPN field lost")}</text>`,
    )
    .join("\n")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="810" viewBox="0 0 1440 810">
<rect width="100%" height="100%" fill="#101820"/>
<g font-family="sans-serif" fill="white">
<text x="24" y="38" font-size="26">HDMI EDID Debug Board — manufacturer part numbers</text>
<text x="24" y="80" font-size="21">Original KiCad · full board</text>
<text x="732" y="80" font-size="21">Fixed KiCad round trip · full board</text>
<text x="24" y="110" font-size="18" fill="#8fd6a7">${sourceParts.length} components · ${originalMpns.length} MPN fields</text>
<text x="732" y="110" font-size="18" fill="${color}">${outputParts.length} components · ${exportedMpns.length} MPN fields · ${lost} lost</text>
<g font-size="19">${rows}</g>
<text x="24" y="786" font-size="17" fill="#b8c7d3">Rows show parsed MPN properties. Manufacturer-name support and Value fidelity are separate import/export concerns.</text>
</g>
${panels.join("\n")}
</svg>`
  await expectOpenSourceSvgSnapshot(svg, import.meta.path)
}, 30_000)
