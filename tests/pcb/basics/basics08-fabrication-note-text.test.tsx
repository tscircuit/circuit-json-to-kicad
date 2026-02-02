import { expect, test } from "bun:test"
import type { PcbFabricationNoteText } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("pcb basics08 fabrication note text", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={0} pcbY={0} />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]

  // Find the pcb_component_id for R1
  const pcbComponent = circuitJson.find(
    (el) => el.type === "pcb_component" && el.source_component_id,
  )

  // Add fabrication note text elements manually to the circuit JSON
  const fabNoteText1: PcbFabricationNoteText = {
    type: "pcb_fabrication_note_text",
    pcb_fabrication_note_text_id: "fab_note_1",
    pcb_component_id: pcbComponent?.pcb_component_id || "",
    font: "tscircuit2024",
    font_size: 1,
    text: "FAB NOTE: Center",
    layer: "top",
    anchor_position: { x: 0, y: 5 },
    anchor_alignment: "center",
  }

  const fabNoteText2: PcbFabricationNoteText = {
    type: "pcb_fabrication_note_text",
    pcb_fabrication_note_text_id: "fab_note_2",
    pcb_component_id: pcbComponent?.pcb_component_id || "",
    font: "tscircuit2024",
    font_size: 1.0,
    text: "Top Left",
    layer: "top",
    anchor_position: { x: 0, y: -5 },
    anchor_alignment: "top_left",
  }

  circuitJson.push(fabNoteText1, fabNoteText2)

  Bun.write(
    "./debug-output/pcb-fabrication-note-circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)

  converter.runUntilFinished()

  Bun.write(
    "./debug-output/kicad-fabrication-note.kicad_pcb",
    converter.getOutputString(),
  )

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "pcb",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
