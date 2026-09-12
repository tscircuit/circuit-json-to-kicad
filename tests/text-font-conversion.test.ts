import { expect, test } from "bun:test"
import type {
  CircuitJson,
  PcbFabricationNoteText,
  PcbNoteText,
} from "circuit-json"
import {
  parseKicadPcb,
  parseKicadSch,
  At,
  SchematicSymbol,
  SymbolProperty,
  TextEffects,
} from "kicadts"
import { identity } from "transformation-matrix"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createFabricationNoteTextFromCircuitJson } from "lib/pcb/stages/utils/CreateFabricationNoteTextFromCircuitJson"
import { convertNoteTexts } from "lib/pcb/stages/footprints-stage-converters/convertNoteTexts"
import { createTextFromPrimitive } from "lib/schematic/stages/symbols-stage-converters/createTextFromPrimitive"
import { createCircuitJsonTextFont } from "lib/utils/create-circuit-json-text-font"

import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import simpleCircuit from "./assets/simple-circuit.json"

import { applyKicadSymbolMetadata } from "lib/kicad-library/kicad-library-converter-utils/applyKicadSymbolMetadata"

const note: PcbNoteText = {
  type: "pcb_note_text",
  pcb_note_text_id: "note",
  text: "SN74LVC1G17DCKR",
  font: "tscircuit2024",
  font_size: 0.8,
  anchor_position: { x: 2, y: 3 },
  anchor_alignment: "bottom_right",
  layer: "bottom",
  is_mirrored_from_top_view: false,
}

test("fabrication and PCB notes fit the source width and retain placement", () => {
  const fabrication: PcbFabricationNoteText = {
    ...note,
    type: "pcb_fabrication_note_text",
    pcb_fabrication_note_text_id: "fab",
    pcb_component_id: "component",
    text: note.text!,
    ccw_rotation: 90,
  }
  const fab = createFabricationNoteTextFromCircuitJson({
    textElement: fabrication,
    c2kMatPcb: identity(),
  })!
  const [componentNote] = convertNoteTexts({
    noteTexts: [note],
    componentCenter: { x: 0, y: 0 },
    componentRotation: 0,
  })
  for (const element of [fab, componentNote!]) {
    expect(element.effects!.font!.size!.height).toBe(0.8)
    expect(element.effects!.font!.size!.width).toBeCloseTo(0.489157, 5)
    expect(element.effects!.font!.thickness).toBe(0.08)
    expect(String(element.layer)).toContain("B.Fab")
    expect(element.effects!.justify!.horizontal).toBe("right")
    expect(element.effects!.justify!.vertical).toBe("bottom")
  }
  expect((fab.position as At).angle).toBe(90)
  expect(componentNote!.effects!.justify!.mirror).toBeFalsy()
})

test("standalone PCB notes are exported once, with explicit mirror preserved", () => {
  const converter = new CircuitJsonToKicadPcbConverter([note] as CircuitJson)
  converter.runUntilFinished()
  const pcb = parseKicadPcb(converter.getOutputString())
  const notes = pcb.graphicTexts.filter((text) => text.text === note.text)
  expect(notes).toHaveLength(1)
  expect(notes[0]!.effects!.font!.size!.width).toBeCloseTo(0.489157, 5)
  expect(notes[0]!.effects!.justify!.mirror).toBeFalsy()
})

test("symbol text applies schematic scaling before fitting and retains anchor/angle", () => {
  const text = createTextFromPrimitive({
    schText: {
      text: note.text!,
      x: 2,
      y: 3,
      fontSize: 0.2,
      anchor: "top_left",
      rotation: 90,
    },
    transform: identity(),
    scale: 4,
  })
  expect(text.effects!.font!.size!.height).toBe(0.8)
  expect(text.effects!.font!.size!.width).toBeCloseTo(0.489157, 5)
  expect(text.at).toMatchObject({ x: 2, y: 3, angle: 90 })
  expect(text.effects!.justify!.horizontal).toBe("left")
  expect(text.effects!.justify!.vertical).toBe("top")
})

test("explicit native KiCad font metadata bypasses source font fitting", () => {
  const font = createCircuitJsonTextFont(note, {
    size: { x: "2", y: "3" },
    thickness: "0.25",
  })
  expect(font.size).toEqual({ width: 2, height: 3 })
  expect(font.thickness).toBe(0.25)
  const partial = createCircuitJsonTextFont(note, { thickness: 0.2 })
  expect(partial.size).toEqual({ width: 0.8, height: 0.8 })
  expect(partial.thickness).toBe(0.2)
})

test("schematic labels and generated reference/value fields use fitted fonts", () => {
  const converter = new CircuitJsonToKicadSchConverter([
    ...simpleCircuit,
    {
      type: "source_net",
      source_net_id: "net_font_test",
      name: "SN74LVC1G17DCKR",
    },
    {
      type: "schematic_net_label",
      schematic_net_label_id: "label_font_test",
      source_net_id: "net_font_test",
      text: "SN74LVC1G17DCKR",
      center: { x: 0, y: 0 },
      anchor_side: "left",
    },
  ] as CircuitJson)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  const reference = schematic.symbols[0]!.properties.find(
    (p) => p.key === "Reference",
  )!
  expect(reference.value).toBe("R1")
  expect(reference.effects!.font!.size!.height).toBe(1.27)
  expect(reference.effects!.font!.size!.width).toBeCloseTo(0.698478, 5)
  const label = schematic.globalLabels.find(
    (l) => l.value === "SN74LVC1G17DCKR",
  )!
  expect(label).toBeDefined()
  expect(label.effects!.font!.size!.height).toBe(1.27)
  expect(label.effects!.font!.size!.width).toBeLessThan(1.27)
  expect(label.effects!.font!.thickness).toBe(0.1)
})

test("library property value changes are refitted while native overrides survive", () => {
  const symbol = new SchematicSymbol()
  symbol.properties.push(
    new SymbolProperty({
      key: "Value",
      value: "iii",
      effects: new TextEffects({
        font: createCircuitJsonTextFont({ text: "iii", font_size: 0.8 }),
      }),
    }),
  )
  const entry = { symbolName: "Test", symbol }
  applyKicadSymbolMetadata(entry, {
    properties: { Value: { value: note.text! } },
  })
  expect(symbol.properties[0]!.effects!.font!.size!.width).toBeCloseTo(
    0.489157,
    5,
  )
  applyKicadSymbolMetadata(entry, {
    properties: {
      Value: {
        value: "Native",
        effects: { font: { size: { x: 2, y: 3 }, thickness: 0.25 } },
      },
    },
  })
  expect(symbol.properties[0]!.effects!.font!.size).toEqual({
    width: 2,
    height: 3,
  })
  expect(symbol.properties[0]!.effects!.font!.thickness).toBe(0.25)
})
