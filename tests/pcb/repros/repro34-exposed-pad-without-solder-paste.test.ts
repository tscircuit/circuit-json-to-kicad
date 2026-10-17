import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro34: exposed pad without paste gets a KiCad paste aperture", async () => {
  const circuitJson: CircuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "board",
      center: { x: 0, y: 0 },
      width: 14,
      height: 8,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad_with_paste",
      shape: "circle",
      radius: 1.2,
      x: -3,
      y: 0,
      layer: "top",
      is_covered_with_solder_mask: false,
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad_without_paste",
      shape: "circle",
      radius: 1.2,
      x: 3,
      y: 0,
      layer: "top",
      is_covered_with_solder_mask: false,
    },
    {
      type: "pcb_solder_paste",
      pcb_solder_paste_id: "paste",
      pcb_smtpad_id: "pad_with_paste",
      shape: "circle",
      radius: 0.84,
      x: -3,
      y: 0,
      layer: "top",
    },
    {
      type: "pcb_silkscreen_text",
      pcb_silkscreen_text_id: "paste_label",
      pcb_component_id: "",
      text: "PASTE",
      font: "tscircuit2024",
      font_size: 0.6,
      anchor_position: { x: -3, y: 2.5 },
      anchor_alignment: "center",
      layer: "top",
    },
    {
      type: "pcb_silkscreen_text",
      pcb_silkscreen_text_id: "no_paste_label",
      pcb_component_id: "",
      text: "NO PASTE",
      font: "tscircuit2024",
      font_size: 0.6,
      anchor_position: { x: 3, y: 2.5 },
      anchor_alignment: "center",
      layer: "top",
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = parseKicadPcb(output)
  // Capture the current bug: both pads get paste despite only one source aperture.
  expect(
    pcb.footprints
      .flatMap((footprint) => footprint.fpPads)
      .filter((pad) => pad.layers?.layers.includes("F.Paste")),
  ).toHaveLength(2)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    showSolderPaste: true,
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  const circuitJsonPng = await takeCircuitJsonSnapshot({
    circuitJson,
    outputType: "pcb",
    showSolderPaste: true,
  })
  const { width } = await sharp(circuitJsonPng).metadata()
  expect(
    stackCircuitJsonKicadPngs(
      circuitJsonPng,
      await sharp(kicadSnapshot.generatedFileContent["temp_file.png"]!)
        .resize({ width })
        .toBuffer(),
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
