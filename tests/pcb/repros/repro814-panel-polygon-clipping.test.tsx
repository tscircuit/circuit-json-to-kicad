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

test("pcb repro814 tab-routed panels fail during polygon clipping", async () => {
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
    expect(circuitJson.filter((e) => e.type === "pcb_board")).toHaveLength(4)
    expect(circuitJson.filter((e) => e.type === "pcb_panel")).toHaveLength(1)
    expect(circuitJson.some((e) => e.type === "pcb_cutout")).toBe(true)

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    expect(() => converter.runUntilFinished()).toThrow(
      borderRadius ? /in SweepLine tree/ : /Unable to complete output ring/,
    )
    expect(converter.finished).toBe(false)
    expect(
      converter
        .getOutput()
        .graphicLines.filter((line) => line.layer?.names[0] === "Edge.Cuts"),
    ).toHaveLength(0)

    // Render only the partial PCB left at the failure, not a successful export.
    // Keep the source Circuit JSON and converter output unmodified.
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
