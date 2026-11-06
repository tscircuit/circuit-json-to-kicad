import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("standalone PCB notes preserve layers, anchors, sizes, and distinct IDs", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="12mm" routingDisabled>
      <pcbnotetext
        text="NOTE"
        pcbX={-3}
        pcbY={2}
        layer="top"
        fontSize={0.8}
        anchorAlignment="top_left"
      />
      <pcbnotetext
        text="NOTE"
        pcbX={3}
        pcbY={-2}
        layer="bottom"
        fontSize={1.2}
        anchorAlignment="bottom_right"
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const original = JSON.stringify(circuitJson)
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const notes = parseKicadPcb(converter.getOutputString()).graphicTexts
  expect(notes).toHaveLength(2)
  for (const [index, expected] of [
    {
      layer: "F.Fab",
      x: 97,
      y: 98,
      size: 0.8,
      horizontal: "left" as const,
      vertical: "top" as const,
    },
    {
      layer: "B.Fab",
      x: 103,
      y: 102,
      size: 1.2,
      horizontal: "right" as const,
      vertical: "bottom" as const,
    },
  ].entries()) {
    const note = notes[index]!
    expect(note.text).toBe("NOTE")
    expect(note.layer?.names).toEqual([expected.layer])
    expect(note.position?.x).toBe(expected.x)
    expect(note.position?.y).toBe(expected.y)
    expect(note.effects?.font?.size).toEqual({
      width: expected.size,
      height: expected.size,
    })
    expect(note.effects?.justify?.horizontal).toBe(expected.horizontal)
    expect(note.effects?.justify?.vertical).toBe(expected.vertical)
  }
  expect(notes[0]!.uuid).not.toEqual(notes[1]!.uuid)
  expect(JSON.stringify(circuitJson)).toBe(original)
})
