import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import smartwatch from "tests/assets/smartwatch-pcb.json"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("Smartwatch PCB exports with subdivided traces above the iteration limit", async () => {
  // Smartwatch v1.0.14: retain the downloaded PCB/source records unchanged;
  // omit schematic, CAD model and project metadata from this PCB fixture.
  // Its 867 traces do not hit the old limit. Split each at its midpoint to
  // exercise 1,734 records without changing the real board's copper geometry.
  const circuitJson = smartwatch as CircuitJson
  const traces = circuitJson.filter((element) => element.type === "pcb_trace")
  expect(traces).toHaveLength(867)

  const subdividedCircuitJson = circuitJson.flatMap((element): CircuitJson => {
    if (element.type !== "pcb_trace") return [element]

    expect(element.route).toHaveLength(2)
    const [start, end] = element.route
    if (start?.route_type !== "wire" || end?.route_type !== "wire") {
      throw new Error("Expected two wire endpoints in each Smartwatch trace")
    }
    expect(end.layer).toBe(start.layer)
    expect(end.width).toBe(start.width)
    const midpoint = {
      ...start,
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    }
    const halfLength = Math.hypot(end.x - start.x, end.y - start.y) / 2
    return [
      {
        ...element,
        pcb_trace_id: `${element.pcb_trace_id}_a`,
        route: [start, midpoint],
        trace_length: halfLength,
      },
      {
        ...element,
        pcb_trace_id: `${element.pcb_trace_id}_b`,
        route: [midpoint, end],
        trace_length: halfLength,
      },
    ]
  })
  expect(
    subdividedCircuitJson.filter((element) => element.type === "pcb_trace"),
  ).toHaveLength(1734)

  const originalConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  originalConverter.runUntilFinished()
  const originalPcb = parseKicadPcb(originalConverter.getOutputString())
  expect(originalPcb.segments).toHaveLength(867)

  const converter = new CircuitJsonToKicadPcbConverter(subdividedCircuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = parseKicadPcb(output)
  expect(pcb.segments).toHaveLength(1734)
  expect(pcb.footprints).toHaveLength(originalPcb.footprints.length)
  expect(pcb.vias).toHaveLength(originalPcb.vias.length)
  expect(pcb.zones).toHaveLength(originalPcb.zones.length)

  for (const [index, original] of originalPcb.segments.entries()) {
    const first = pcb.segments[index * 2]!
    const second = pcb.segments[index * 2 + 1]!
    expect(first.start).toEqual(original.start)
    expect(second.end).toEqual(original.end)
    expect(first.end).toMatchObject({ x: second.start!.x, y: second.start!.y })
    expect(first.end!.x).toBeCloseTo((original.start!.x + original.end!.x) / 2)
    expect(first.end!.y).toBeCloseTo((original.start!.y + original.end!.y) / 2)
    for (const segment of [first, second]) {
      expect(segment.width).toBe(original.width)
      expect(segment.layer).toEqual(original.layer)
      expect(segment.net).toEqual(original.net)
    }
  }

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
    pcbCopperPourOpacity: 0.4,
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 20_000)
