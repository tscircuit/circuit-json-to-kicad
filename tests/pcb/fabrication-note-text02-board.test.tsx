import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { Fragment } from "react"
import { Circuit } from "tscircuit-latest"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

test("standalone fabrication notes retain rotation, alignment, and layer", async () => {
  const circuit = new Circuit()
  const layers = ["top", "bottom"] as const
  const rotations = [0, 45, 90, 270]
  circuit.add(
    <board width={60} height={36} pcbX={3} pcbY={2} routingDisabled>
      {layers.flatMap((layer, row) =>
        rotations.map((rotation, column) => (
          <Fragment key={`${layer}-${rotation}`}>
            <fabricationnotetext
              text={`${layer} ${rotation}`}
              pcbX={-18 + column * 12}
              pcbY={7 - row * 14}
              pcbRotation={rotation}
              layer={layer}
              fontSize={1}
              anchorAlignment="top_right"
            />
          </Fragment>
        )),
      )}
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const sourceNotes = circuitJson.filter(
    (entry) => entry.type === "pcb_fabrication_note_text",
  )
  expect(sourceNotes).toHaveLength(8)
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const outputString = converter.getOutputString()
  const pcb = parseKicadPcb(outputString)
  expect(pcb.footprints).toHaveLength(0)
  expect(pcb.graphicTexts).toHaveLength(8)
  for (const sourceNote of sourceNotes) {
    const note = pcb.graphicTexts.find((text) => text.text === sourceNote.text)!
    const noteCcwRotationDegrees =
      "angle" in note.position! ? (note.position.angle ?? 0) : 0
    expect(noteCcwRotationDegrees).toBeCloseTo(sourceNote.ccw_rotation ?? 0)
    expect(note.position?.x).toBeCloseTo(100 + sourceNote.anchor_position.x)
    expect(note.position?.y).toBeCloseTo(100 - sourceNote.anchor_position.y)
    expect(note.layer?.names).toEqual([
      sourceNote.layer === "bottom" ? "B.Fab" : "F.Fab",
    ])
    expect(note.effects?.justify?.horizontal).toBe("right")
    expect(note.effects?.justify?.vertical).toBe("top")
    expect(note.effects?.justify?.mirror ?? false).toBe(false)
  }

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      snapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 31_000)
