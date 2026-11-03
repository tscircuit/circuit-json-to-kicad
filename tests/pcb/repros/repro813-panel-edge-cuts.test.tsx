import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("pcb repro813 exports the panel boundary and routing around every board", async () => {
  for (const panelizationMethod of [
    "tab-routing",
    "outline_routing",
  ] as const) {
    const circuit = new Circuit()
    circuit.add(
      <panel
        layoutMode="grid"
        row={3}
        col={3}
        boardGap="2mm"
        panelizationMethod={panelizationMethod}
        tabLength="3mm"
      >
        {Array.from({ length: 9 }, (_, index) => (
          <board key={index} width="14mm" height="18mm">
            <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
            <capacitor
              name="C1"
              capacitance="100nF"
              footprint="0402"
              pcbX={2}
            />
            <trace from=".R1 > .pin2" to=".C1 > .pin1" />
          </board>
        ))}
      </panel>,
    )
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()
    const originalCircuitJson = structuredClone(circuitJson)
    const panel = circuitJson.find((element) => element.type === "pcb_panel")!
    const boards = circuitJson.filter((element) => element.type === "pcb_board")
    expect(boards).toHaveLength(9)

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()
    expect(converter.finished).toBe(true)
    expect(circuitJson).toEqual(originalCircuitJson)
    const edges = converter
      .getOutput()
      .graphicLines.filter((line) => line.layer?.names[0] === "Edge.Cuts")
    // Compare in Circuit JSON coordinates: the converter translates by 100 mm
    // and flips Y when writing KiCad coordinates.
    const segments = edges.map((line) => ({
      start: { x: line.start!.x - 100, y: 100 - line.start!.y },
      end: { x: line.end!.x - 100, y: 100 - line.end!.y },
    }))
    const points = segments.flatMap(({ start, end }) => [start, end])
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(
      panel.center.x - panel.width / 2,
      6,
    )
    expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(
      panel.center.x + panel.width / 2,
      6,
    )
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(
      panel.center.y - panel.height / 2,
      6,
    )
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(
      panel.center.y + panel.height / 2,
      6,
    )

    // Each board must have routed edges around all four sides, including the
    // center board, which cannot be covered by checking only the panel bounds.
    for (const board of boards) {
      const nearbyPoints = points.filter(
        (p) =>
          Math.abs(p.x - board.center.x) <= board.width! / 2 + 2 &&
          Math.abs(p.y - board.center.y) <= board.height! / 2 + 2,
      )
      expect(
        nearbyPoints.some((p) => p.x <= board.center.x - board.width! / 2),
      ).toBe(true)
      expect(
        nearbyPoints.some((p) => p.x >= board.center.x + board.width! / 2),
      ).toBe(true)
      expect(
        nearbyPoints.some((p) => p.y <= board.center.y - board.height! / 2),
      ).toBe(true)
      expect(
        nearbyPoints.some((p) => p.y >= board.center.y + board.height! / 2),
      ).toBe(true)
      if (panelizationMethod === "tab-routing") {
        // A continuous board rectangle here would cut through the connecting tab.
        const bottom = board.center.y - board.height! / 2
        expect(
          segments.some(
            ({ start, end }) =>
              Math.abs(start.y - bottom) < 0.000001 &&
              Math.abs(end.y - bottom) < 0.000001 &&
              Math.min(start.x, end.x) < board.center.x &&
              Math.max(start.x, end.x) > board.center.x,
          ),
        ).toBe(false)
      }
    }

    const endpointCounts = new Map<string, number>()
    const segmentKeys = new Set<string>()
    for (const { start, end } of segments) {
      const keys = [start, end].map(
        (p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`,
      )
      expect(keys[0]).not.toBe(keys[1])
      const segmentKey = [...keys].sort().join("/")
      expect(segmentKeys.has(segmentKey)).toBe(false)
      segmentKeys.add(segmentKey)
      for (const key of keys)
        endpointCounts.set(key, (endpointCounts.get(key) ?? 0) + 1)
    }
    expect([...endpointCounts.values()].every((count) => count === 2)).toBe(
      true,
    )

    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: converter.getOutputString(),
      kicadFileType: "pcb",
    })
    expect(kicadSnapshot.exitCode).toBe(0)
    await expect(
      stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(
      import.meta.path,
      `repro813-panel-${panelizationMethod}`,
    )
  }
}, 30_000)
