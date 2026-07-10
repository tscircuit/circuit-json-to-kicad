import { expect, test } from "bun:test"
import type { PcbFabricationNoteText, PcbSilkscreenText } from "circuit-json"
import { readFileSync } from "node:fs"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const createRepro27CircuitJson = async () => {
  const circuitJson = JSON.parse(
    readFileSync("tests/assets/simple-circuit.json", "utf8"),
  ) as any[]
  const pcbComponent = circuitJson.find((entry) => entry.type === "pcb_component")

  expect(pcbComponent).toBeDefined()

  const standaloneSilkscreenText: PcbSilkscreenText = {
    type: "pcb_silkscreen_text",
    pcb_silkscreen_text_id: "repro27_board_text",
    pcb_component_id: "",
    font: "tscircuit2024",
    font_size: 0.8,
    text: "REV A 2026-07",
    layer: "top",
    anchor_position: { x: 0, y: 3.5 },
    anchor_alignment: "center",
  }

  const footprintSilkscreenText: PcbSilkscreenText = {
    type: "pcb_silkscreen_text",
    pcb_silkscreen_text_id: "repro27_footprint_text",
    pcb_component_id: pcbComponent!.pcb_component_id,
    font: "tscircuit2024",
    font_size: 0.8,
    text: "FOOTPRINT SILK",
    layer: "top",
    anchor_position: {
      x: pcbComponent!.center.x,
      y: pcbComponent!.center.y - 2.2,
    },
    anchor_alignment: "center",
  }

  const fabricationNoteText: PcbFabricationNoteText = {
    type: "pcb_fabrication_note_text",
    pcb_fabrication_note_text_id: "repro27_fab_text",
    pcb_component_id: pcbComponent!.pcb_component_id,
    font: "tscircuit2024",
    font_size: 0.8,
    text: "FAB NOTE",
    layer: "top",
    anchor_position: { x: 0, y: -3.5 },
    anchor_alignment: "center",
  }

  circuitJson.push(
    standaloneSilkscreenText,
    footprintSilkscreenText,
    fabricationNoteText,
  )

  return circuitJson
}

test(
  "pcb repro27 preserves text font size and writes explicit thickness",
  async () => {
    const circuitJson = await createRepro27CircuitJson()

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()

    const outputString = converter.getOutputString()

    expect(outputString).toMatch(
      /\(gr_text\s+"REV A 2026-07"[\s\S]*?\(size 0\.8 0\.8\)[\s\S]*?\(thickness 0\.15\)/,
    )
    expect(outputString).toMatch(
      /\(fp_text\s+user\s+"FOOTPRINT SILK"[\s\S]*?\(size 0\.8 0\.8\)[\s\S]*?\(thickness 0\.15\)/,
    )
    expect(outputString).toMatch(
      /\(gr_text\s+"FAB NOTE"[\s\S]*?\(layer F\.Fab\)[\s\S]*?\(size 0\.8 0\.8\)[\s\S]*?\(thickness 0\.15\)/,
    )

    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: outputString,
      kicadFileType: "pcb",
    })

    expect(kicadSnapshot.exitCode).toBe(0)

    expect(
      stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({
          circuitJson,
          outputType: "pcb",
        }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 120000 },
)
