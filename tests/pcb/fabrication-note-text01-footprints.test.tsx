import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { Circuit } from "tscircuit-latest"
import {
  applyToPoint,
  compose,
  rotateDEG,
  translate,
} from "transformation-matrix"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

test("fabrication notes remain attached to rotated footprints on both layers", async () => {
  const circuit = new Circuit()
  const layers = ["top", "bottom"] as const
  const rotations = [0, 90, 180, 270]
  circuit.add(
    <board width={60} height={34} routingDisabled>
      {layers.flatMap((layer, row) =>
        rotations.map((rotation, column) => (
          <chip
            key={`${layer}-${rotation}`}
            name={`U${row * 4 + column + 1}`}
            pcbX={-18 + column * 12}
            pcbY={7 - row * 14}
            pcbRotation={rotation}
            layer={layer}
            footprint={
              <footprint>
                <smtpad
                  pcbX={0}
                  pcbY={0}
                  width={1}
                  height={1}
                  shape="rect"
                  portHints={["1"]}
                />
                <fabricationnotetext
                  text={`${layer} ${rotation}`}
                  pcbX={1.5}
                  pcbY={2}
                  fontSize={1}
                  anchorAlignment="bottom_left"
                />
              </footprint>
            }
          />
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
  expect(pcb.footprints).toHaveLength(8)
  expect(
    pcb.graphicTexts.filter((text) =>
      text.layer?.names.some((layer) => layer.endsWith(".Fab")),
    ),
  ).toHaveLength(0)

  for (const sourceNote of sourceNotes) {
    const sourceComponent = circuitJson.find(
      (entry) =>
        entry.type === "pcb_component" &&
        entry.pcb_component_id === sourceNote.pcb_component_id,
    )
    if (!sourceComponent || sourceComponent.type !== "pcb_component")
      throw new Error("Missing owning PCB component")
    const footprint = pcb.footprints.find(
      (footprint) =>
        Math.abs(footprint.position!.x - (100 + sourceComponent.center.x)) <
          0.0001 &&
        Math.abs(footprint.position!.y - (100 - sourceComponent.center.y)) <
          0.0001,
    )!
    const notes = footprint.fpTexts.filter((text) =>
      text.layer?.names.some((layer) => layer.endsWith(".Fab")),
    )
    expect(notes).toHaveLength(1)
    const note = notes[0]!
    expect(note.text).toBe(sourceNote.text)
    expect(note.type).toBe("user")
    expect(note.layer?.names).toEqual([
      sourceNote.layer === "bottom" ? "B.Fab" : "F.Fab",
    ])
    expect(note.effects?.justify?.mirror ?? false).toBe(false)
    expect(note.effects?.justify?.horizontal).toBe("left")
    expect(note.effects?.justify?.vertical).toBe("bottom")
    expect(note.effects?.font?.size?.width).toBeCloseTo(sourceNote.font_size)
    expect(note.effects?.font?.thickness).toBeCloseTo(0.15)
    const noteCcwRotationDegrees =
      "angle" in note.position! ? (note.position.angle ?? 0) : 0
    expect(noteCcwRotationDegrees).toBeCloseTo(sourceNote.ccw_rotation ?? 0)

    // KiCad footprint-local points use mm with +X right and +Y down.
    // Recover world coordinates from the exported parent placement. Keeping
    // the note local also means it follows subsequent footprint moves.
    const footprintCcwRotationDegrees =
      "angle" in footprint.position! ? (footprint.position.angle ?? 0) : 0
    const localToBoard = compose(
      translate(footprint.position!.x, footprint.position!.y),
      rotateDEG(-footprintCcwRotationDegrees),
    )
    const boardPosition = applyToPoint(localToBoard, note.position!)
    expect(boardPosition.x).toBeCloseTo(100 + sourceNote.anchor_position.x)
    expect(boardPosition.y).toBeCloseTo(100 - sourceNote.anchor_position.y)
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
