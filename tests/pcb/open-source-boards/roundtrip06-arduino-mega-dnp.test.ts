import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../../lib"
import { expectOpenSourceSvgSnapshot } from "../../fixtures/create-open-source-schematic-svg-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro4948: Arduino Mega preserves 66 components but loses 2 DNP flags on export", async () => {
  const filename = "arduino-mega-2560.kicad_pcb"
  const sourceText = await readFile(resolve("references", filename), "utf8")
  const source = parseKicadPcb(sourceText)
  const importer = new KicadToCircuitJsonConverter()
  importer.addFile(filename, sourceText)
  importer.runUntilFinished()
  const circuitJson = importer.getOutput()
  const components = circuitJson.filter((item) => item.type === "pcb_component")
  const importedDnp = components.filter((component) => component.do_not_place)
  expect(components).toHaveLength(66)
  expect(importedDnp).toHaveLength(2)

  const exporter = new CircuitJsonToKicadPcbConverter(circuitJson)
  exporter.runUntilFinished()
  const outputText = exporter.getOutputString()
  const output = parseKicadPcb(outputText)
  const reference = (footprint: (typeof source.footprints)[number]) =>
    footprint.properties.find((property) => property.key === "Reference")?.value
  const sourceDnp = source.footprints.filter((footprint) => footprint.attr?.dnp)
  const outputDnp = output.footprints.filter((footprint) => footprint.attr?.dnp)
  expect(sourceDnp.map(reference).sort()).toEqual(["R1", "R2"])
  const retainedComponents = output.footprints.filter((footprint) =>
    source.footprints.some(
      (original) => reference(original) === reference(footprint),
    ),
  )
  expect(retainedComponents).toHaveLength(source.footprints.length)
  expect(outputDnp).toHaveLength(0)

  for (const original of source.footprints) {
    const converted = output.footprints.find(
      (footprint) => reference(footprint) === reference(original),
    )
    if (!converted) throw new Error(`Missing ${reference(original)}`)
    if (original.attr?.dnp) {
      expect(converted.fpPads).toHaveLength(original.fpPads.length)
      expect(converted.fpPads.map((pad) => pad.number).sort()).toEqual([
        "1",
        "2",
      ])
    }
    // DNP and exclusion from BOM/position files are independent KiCad flags.
    expect(Boolean(converted.attr?.excludeFromBom)).toBe(
      Boolean(original.attr?.excludeFromBom),
    )
    expect(Boolean(converted.attr?.excludeFromPosFiles)).toBe(
      Boolean(original.attr?.excludeFromPosFiles),
    )
    if (!original.attr?.dnp) expect(converted.attr?.dnp).not.toBe(true)
  }
  const reimporter = new KicadToCircuitJsonConverter()
  reimporter.addFile(filename, outputText)
  reimporter.runUntilFinished()
  expect(
    reimporter
      .getOutput()
      .filter((item) => item.type === "pcb_component" && item.do_not_place),
  ).toHaveLength(0)

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
    return `<svg data-comparison="${index ? "converted" : "source"}" x="${24 + index * 708}" y="128" width="684" height="410" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${contents}</svg>`
  })
  const lost = sourceDnp.length - outputDnp.length
  const color = lost ? "#ff8585" : "#8fd6a7"
  const rows = sourceDnp
    .map((footprint, index) => {
      const name = reference(footprint)
      const converted = output.footprints.find(
        (item) => reference(item) === name,
      )!
      return `<text x="40" y="${602 + index * 34}">${name}: DNP · ${footprint.fpPads.length} copper pads retained</text>
<text x="748" y="${602 + index * 34}" fill="${color}">${name}: ${converted.attr?.dnp ? "DNP" : "DNP lost — fitted"} · ${converted.fpPads.length} copper pads retained</text>`
    })
    .join("\n")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="700" viewBox="0 0 1440 700">
<rect width="100%" height="100%" fill="#101820"/>
<g font-family="sans-serif" fill="white">
<text x="24" y="38" font-size="26">Arduino Mega 2560 — Do Not Populate (DNP)</text>
<text x="24" y="80" font-size="21">Original KiCad · full board</text>
<text x="732" y="80" font-size="21">Current KiCad round trip · full board</text>
<text x="24" y="110" font-size="18" fill="#8fd6a7">${source.footprints.length} components · ${sourceDnp.length} DNP flags</text>
<text x="732" y="110" font-size="18" fill="${color}">${retainedComponents.length} components · ${outputDnp.length} DNP flags · ${lost} lost</text>
<g font-size="19">${rows}</g>
<text x="24" y="678" font-size="17" fill="#b8c7d3">Labels show parsed assembly status. DNP retains the component and its copper in the board design.</text>
</g>
${panels.join("\n")}
</svg>`
  await expectOpenSourceSvgSnapshot(svg, import.meta.path)
})
