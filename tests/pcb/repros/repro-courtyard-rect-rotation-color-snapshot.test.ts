import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import fixture from "../../assets/repro-courtyard-rect-rotation-color.circuit.json"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const cases = [
  { layer: "top", rotation: 45, center: { x: -5, y: 4 }, color: "#ff3366" },
  { layer: "top", rotation: 90, center: { x: 5, y: 4 }, color: "#3366ff" },
  { layer: "bottom", rotation: 45, center: { x: -5, y: -4 }, color: "#ff3366" },
  { layer: "bottom", rotation: 90, center: { x: 5, y: -4 }, color: "#3366ff" },
] as const

function createSnapshotCircuitJson(): CircuitJson {
  const base = structuredClone(fixture) as CircuitJson
  const board = base.find((e) => e.type === "pcb_board")!
  const source = base.find((e) => e.type === "source_component")!
  const component = base.find((e) => e.type === "pcb_component")!
  const courtyard = base.find((e) => e.type === "pcb_courtyard_rect")!
  const circuitJson: CircuitJson = [{ ...board, width: 24, height: 22 }]

  for (const [index, { layer, rotation, center, color }] of cases.entries()) {
    const sourceId = `source_component_${index}`
    const componentId = `pcb_component_${index}`
    circuitJson.push(
      { ...source, source_component_id: sourceId, name: `R${index + 1}` },
      {
        ...component,
        pcb_component_id: componentId,
        source_component_id: sourceId,
        center,
        layer,
      },
      {
        ...courtyard,
        pcb_courtyard_rect_id: `pcb_courtyard_rect_${index}`,
        pcb_component_id: componentId,
        center,
        layer,
        ccw_rotation: rotation,
        color,
      },
      {
        type: "pcb_silkscreen_text",
        pcb_silkscreen_text_id: `pcb_silkscreen_text_${index}`,
        pcb_component_id: "",
        // Board-level labels stay readable in this combined top/bottom view.
        layer: "top",
        anchor_position: { x: center.x, y: center.y + 4 },
        anchor_alignment: "center",
        font: "tscircuit2024",
        font_size: 0.75,
        text: `${layer.toUpperCase()} ${rotation} deg`,
      },
    )
  }

  return circuitJson
}

test(
  "repro courtyard: top and bottom rotation comparison snapshot",
  async () => {
    const circuitJson = createSnapshotCircuitJson()
    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()
    const output = converter.getOutputString()
    const pcb = parseKicadPcb(output)

    expect(pcb.footprints).toHaveLength(4)
    for (const [index, { layer }] of cases.entries()) {
      const footprint = pcb.footprints[index]!
      expect(footprint.layer?.names).toEqual([
        layer === "top" ? "F.Cu" : "B.Cu",
      ])
      const graphics = [...footprint.fpRects, ...footprint.fpPolys]
      expect(graphics).toHaveLength(1)
      expect(graphics[0]!.layer?.names).toEqual([
        layer === "top" ? "F.CrtYd" : "B.CrtYd",
      ])
    }

    // Circuit JSON and the actual KiCad export must both show rotated
    // courtyards on the top and bottom layers.
    // Both image renderers use their courtyard layer palettes. Per-element
    // color preservation is asserted by the serialized-stroke regression tests.
    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: output,
      kicadFileType: "pcb",
    })
    expect(kicadSnapshot.exitCode).toBe(0)

    await expect(
      stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 120000 },
)
