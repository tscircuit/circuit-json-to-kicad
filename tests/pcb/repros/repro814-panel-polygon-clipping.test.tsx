import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

const PanelBoard = ({ borderRadius }: { borderRadius?: string }) => (
  <board width="14mm" height="18mm" borderRadius={borderRadius}>
    <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
    <capacitor name="C1" capacitance="100nF" footprint="0402" pcbX={2} />
    <trace from=".R1 > .pin2" to=".C1 > .pin1" />
  </board>
)

test("pcb repro814 tab-routed panels export without polygon clipping failures", async () => {
  for (const borderRadius of [undefined, "2mm"]) {
    const circuit = new Circuit()
    circuit.add(
      <panel
        layoutMode="grid"
        row={2}
        col={2}
        boardGap="2mm"
        panelizationMethod="tab-routing"
        tabLength="3mm"
      >
        <PanelBoard borderRadius={borderRadius} />
        <PanelBoard borderRadius={borderRadius} />
        <PanelBoard borderRadius={borderRadius} />
        <PanelBoard borderRadius={borderRadius} />
      </panel>,
    )
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()
    const originalCircuitJson = structuredClone(circuitJson)
    expect(circuitJson.filter((e) => e.type === "pcb_board")).toHaveLength(4)
    expect(circuitJson.filter((e) => e.type === "pcb_panel")).toHaveLength(1)
    expect(circuitJson.some((e) => e.type === "pcb_cutout")).toBe(true)

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()
    expect(converter.finished).toBe(true)
    expect(circuitJson).toEqual(originalCircuitJson)
    expect(
      converter
        .getOutput()
        .footprints.filter((footprint) =>
          footprint.properties.some(
            (property) =>
              property.key === "Reference" &&
              ["R1", "C1"].includes(property.value),
          ),
        ),
    ).toHaveLength(8)
    const edgeCuts = converter
      .getOutput()
      .graphicLines.filter((line) => line.layer?.names[0] === "Edge.Cuts")
    expect(edgeCuts.length).toBeGreaterThan(0)
    const endpointCounts = new Map<string, number>()
    for (const line of edgeCuts) {
      const startKey = `${line.start!.x.toFixed(6)},${line.start!.y.toFixed(6)}`
      const endKey = `${line.end!.x.toFixed(6)},${line.end!.y.toFixed(6)}`
      expect(startKey).not.toBe(endKey)
      for (const point of [line.start!, line.end!]) {
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
      }
      for (const key of [startKey, endKey]) {
        endpointCounts.set(key, (endpointCounts.get(key) ?? 0) + 1)
      }
    }
    // Every segment joins another at each end, including at KiCad's precision.
    expect([...endpointCounts.values()].every((count) => count === 2)).toBe(
      true,
    )

    // Issue #813 separately tracks the missing outlines of the other boards.
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
      `repro814-panel-${borderRadius ? "rounded" : "rect"}`,
    )
  }
}, 30_000)
