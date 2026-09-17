import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { type KicadPcb, parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"
import { createSideBySideSvg } from "../../fixtures/create-side-by-side-svg"
import { expectOpenSourceSvgSnapshot } from "../../fixtures/create-open-source-schematic-svg-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

// Unmodified real board, already pinned and downloaded by download-references.
// nushackers/hsp-pcb-intro@ad3fbd582e3915b585c453ea202f591720a1f427
// src/usb_led.kicad_pcb (CERN-OHL-P-2.0)
test("repro4948: HSP USB LED keeps its pads but loses their net assignments", async () => {
  const sourcePath = new URL(
    "../../../references/hsp-usb-led.kicad_pcb",
    import.meta.url,
  )
  const sourceText = readFileSync(sourcePath, "utf8")
  expect(createHash("sha256").update(sourceText).digest("hex")).toBe(
    "a8e69c14ceec9dd0954c3027cc89ca6bbb9c0b0ec3aeede5feacfdd47736f362",
  )
  const sourcePcb = parseKicadPcb(sourceText)
  const importer = new KicadToCircuitJsonConverter()
  importer.addFile("hsp-usb-led.kicad_pcb", sourceText)
  importer.runUntilFinished()
  const circuitJson = importer.getOutput()
  expect(importer.getWarnings()).toEqual([])

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const roundtripText = converter.getOutputString()
  const roundtripPcb = parseKicadPcb(roundtripText)

  const getPads = (pcb: KicadPcb) =>
    pcb.footprints
      .flatMap((footprint) => {
        const reference = footprint.properties.find(
          (property) => property.key === "Reference",
        )?.value
        if (!reference) throw new Error("Missing footprint reference")
        const occurrences = new Map<string, number>()
        return footprint.fpPads.map((pad) => {
          const occurrence = (occurrences.get(pad.number) ?? 0) + 1
          occurrences.set(pad.number, occurrence)
          return {
            // Keep each physical land, including four J1.S1 lands and SW1's pairs.
            key: `${reference}.${pad.number}#${occurrence}`,
            net: pad.net?.name || null,
            type: pad.padType,
          }
        })
      })
      .sort((a, b) => a.key.localeCompare(b.key))

  const sourcePads = getPads(sourcePcb)
  const roundtripPads = getPads(roundtripPcb)
  const roundtripPadsByKey = new Map(roundtripPads.map((pad) => [pad.key, pad]))
  const sourceAssigned = sourcePads.filter((pad) => pad.net !== null).length
  const roundtripAssigned = roundtripPads.filter(
    (pad) => pad.net !== null,
  ).length
  const droppedPadNets = sourcePads
    .filter(
      (pad) =>
        pad.net !== null && roundtripPadsByKey.get(pad.key)?.net === null,
    )
    .map((pad) => [pad.key, pad.net])

  // Capture today's failure, rather than asserting that it is already fixed.
  expect(sourcePcb.footprints).toHaveLength(6)
  expect(sourcePads).toHaveLength(22)
  expect(sourceAssigned).toBe(22)
  expect(roundtripPads.map(({ key, type }) => [key, type])).toEqual(
    sourcePads.map(({ key, type }) => [key, type]),
  )
  expect(roundtripAssigned).toBe(0)
  expect(droppedPadNets).toMatchInlineSnapshot(`
    [
      [
        "D1.1#1",
        "GND",
      ],
      [
        "D1.2#1",
        "Net-(D1-A)",
      ],
      [
        "J1.A12#1",
        "GND",
      ],
      [
        "J1.A5#1",
        "Net-(J1-CC1)",
      ],
      [
        "J1.A9#1",
        "Net-(J1-VBUS-PadA9)",
      ],
      [
        "J1.B12#1",
        "GND",
      ],
      [
        "J1.B5#1",
        "Net-(J1-CC2)",
      ],
      [
        "J1.B9#1",
        "Net-(J1-VBUS-PadA9)",
      ],
      [
        "J1.S1#1",
        "GND",
      ],
      [
        "J1.S1#2",
        "GND",
      ],
      [
        "J1.S1#3",
        "GND",
      ],
      [
        "J1.S1#4",
        "GND",
      ],
      [
        "R1.1#1",
        "Net-(R1-Pad1)",
      ],
      [
        "R1.2#1",
        "Net-(D1-A)",
      ],
      [
        "R2.1#1",
        "Net-(J1-CC2)",
      ],
      [
        "R2.2#1",
        "GND",
      ],
      [
        "R3.1#1",
        "Net-(J1-CC1)",
      ],
      [
        "R3.2#1",
        "GND",
      ],
      [
        "SW1.1#1",
        "Net-(J1-VBUS-PadA9)",
      ],
      [
        "SW1.1#2",
        "Net-(J1-VBUS-PadA9)",
      ],
      [
        "SW1.2#1",
        "Net-(R1-Pad1)",
      ],
      [
        "SW1.2#2",
        "Net-(R1-Pad1)",
      ],
    ]
  `)

  // The board still declares all six named nets; the missing pad membership is
  // not detectable by checking only the net table or pad counts.
  const importedNetNames = circuitJson
    .filter((e) => e.type === "source_net")
    .map((net) => net.name)
    .sort()
  expect(importedNetNames).toHaveLength(6)
  expect(
    roundtripPcb.nets
      .filter((net) => net.id !== 0)
      .map((net) => net.name)
      .sort(),
  ).toEqual(importedNetNames)

  const [sourceSnapshot, roundtripSnapshot] = await Promise.all([
    takeKicadSnapshot({
      kicadFileContent: sourceText,
      kicadFileType: "pcb",
      generatePng: false,
      pcbDrillHoleColor: "white",
      pcbCopperPourOpacity: 0.35,
    }),
    takeKicadSnapshot({
      kicadFileContent: roundtripText,
      kicadFileType: "pcb",
      generatePng: false,
      pcbDrillHoleColor: "white",
      pcbCopperPourOpacity: 0.35,
    }),
  ])
  const normalizeSvg = (svg: string) =>
    svg
      .replace(
        / date \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} /u,
        " date normalized ",
      )
      .replace(/[ \t]+$/gmu, "")
      // Use consistent unitless viewport sizes; retain KiCad's actual viewBox.
      .replace(
        /width="([\d.]+)mm"\s+height="([\d.]+)mm"/u,
        (_, width, height) =>
          `width="600" height="${(600 * Number(height)) / Number(width)}"`,
      )
  const comparison = createSideBySideSvg(
    normalizeSvg(
      sourceSnapshot.generatedFileContent["temp_file.svg"]!.toString("utf8"),
    ),
    normalizeSvg(
      roundtripSnapshot.generatedFileContent["temp_file.svg"]!.toString("utf8"),
    ),
  )
  const height = Number(comparison.match(/<svg[^>]*height="([\d.]+)"/u)?.[1])
  expect(height).toBeGreaterThan(0)
  // Both panels contain native KiCad-rendered board vectors. Header counts are
  // measured from each PCB, since net ownership is invisible in a copper plot.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height + 70}" viewBox="0 0 1200 ${height + 70}">
<rect width="100%" height="100%" fill="#101820"/>
<text x="18" y="28" fill="white" font-family="sans-serif" font-size="20">HSP USB LED — original KiCad</text>
<text x="618" y="28" fill="white" font-family="sans-serif" font-size="20">Current KiCad round trip</text>
<text x="18" y="52" fill="#8fd6a7" font-family="sans-serif" font-size="16">${sourceAssigned}/${sourcePads.length} physical pads have assigned nets</text>
<text x="618" y="52" fill="#ff9b9b" font-family="sans-serif" font-size="16">${roundtripAssigned}/${roundtripPads.length} physical pads have assigned nets</text>
${comparison.replace("<svg", '<svg x="0" y="70"')}
</svg>`
  await expectOpenSourceSvgSnapshot(svg, import.meta.path)
}, 120000)
