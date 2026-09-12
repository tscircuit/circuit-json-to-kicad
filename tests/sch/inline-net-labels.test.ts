import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import { getInlineTraceNetLabels } from "lib/schematic/getInlineTraceNetLabels"
import fixture from "../fixtures/inline-net-labels.json"

test("automatic labels preserve the shared electrical net in KiCad", () => {
  const data = structuredClone(fixture) as CircuitJson
  const converter = new CircuitJsonToKicadSchConverter(data)
  converter.runUntilFinished()
  const sch = converter.getOutput()
  expect(sch.globalLabels).toHaveLength(2)
  expect(sch.globalLabels.map((label) => label.value)).toEqual([
    "SIGNAL",
    "SIGNAL",
  ])
  expect(sch.texts.some((text) => text.value === "SIGNAL")).toBe(false)
  // Both anchors must lie on the actual wire, not at the offset text position.
  const { labels } = getInlineTraceNetLabels(data)
  expect(labels.map((label) => label.anchor_position)).toEqual([
    { x: 1.06, y: 0 },
    { x: 3.9400000000000004, y: 0 },
  ])
})

test("trace annotations and text without source connectivity remain graphics", () => {
  const data = structuredClone(fixture) as CircuitJson
  for (const row of data) {
    if (row.type === "schematic_text") row.text = "Test point"
  }
  const converter = new CircuitJsonToKicadSchConverter(data)
  converter.runUntilFinished()
  expect(converter.getOutput().globalLabels).toHaveLength(0)
  expect(
    converter.getOutput().texts.filter((t) => t.value === "Test point"),
  ).toHaveLength(2)
})

test("does not invent a label position when the source trace has no wire", () => {
  const data = fixture.filter(
    (r) => r.type !== "schematic_trace",
  ) as CircuitJson
  expect(getInlineTraceNetLabels(data).labels).toHaveLength(0)
})
