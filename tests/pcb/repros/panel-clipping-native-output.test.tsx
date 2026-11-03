import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib"
import { Circuit } from "tscircuit"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { PanelClippingRepro } from "./assets/panel-clipping-repro"

test("previously crashing panel inputs produce native KiCad output", async () => {
  for (const rounded of [false, true]) {
    const circuit = new Circuit()
    circuit.add(<PanelClippingRepro rounded={rounded} />)
    await circuit.renderUntilSettled()
    const converter = new CircuitJsonToKicadPcbConverter(
      circuit.getCircuitJson(),
    )
    converter.runUntilFinished()
    const snapshot = await takeKicadSnapshot({
      kicadFileContent: converter.getOutputString(),
      kicadFileType: "pcb",
    })
    expect(snapshot.exitCode).toBe(0)
    await expect(
      snapshot.generatedFileContent["temp_file.png"]!,
    ).toMatchPngSnapshot(
      import.meta.path,
      rounded ? "panel-clipping-rounded-kicad" : "panel-clipping-square-kicad",
    )
  }
})
