import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("fabrication note text rotation is preserved on export", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="30mm" height="16mm" routingDisabled>
      <fabricationnotetext
        text="ROTATED 37 DEG"
        pcbX={0}
        pcbY={3}
        pcbRotation={37}
        fontSize={1.4}
      />
      <fabricationnotetext
        text="0 DEG CONTROL"
        pcbX={0}
        pcbY={-4}
        fontSize={1.4}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const sourceTexts = circuitJson.filter(
    (element) => element.type === "pcb_fabrication_note_text",
  )
  expect(
    sourceTexts.map(({ text, ccw_rotation }) => ({ text, ccw_rotation })),
  ).toEqual([
    { text: "ROTATED 37 DEG", ccw_rotation: 37 },
    { text: "0 DEG CONTROL", ccw_rotation: 0 },
  ])

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()
  const exportedTexts = parseKicadPcb(output).graphicTexts
  expect(
    exportedTexts.map((text) => {
      const position = text.position
      return {
        text: text.text,
        angle: position && "angle" in position ? (position.angle ?? 0) : 0,
      }
    }),
  ).toEqual([
    { text: "ROTATED 37 DEG", angle: 37 },
    { text: "0 DEG CONTROL", angle: 0 },
  ])

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 10_000)
