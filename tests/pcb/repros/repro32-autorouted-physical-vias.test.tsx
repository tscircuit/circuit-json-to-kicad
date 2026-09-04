import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createAutoroutedInnerLayerVias } from "../../fixtures/create-autorouted-inner-layer-vias"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("exports one physical via per autorouted inner-layer escape", async () => {
  const circuitJson = await createAutoroutedInnerLayerVias()
  const physicalVias = circuitJson.filter((e) => e.type === "pcb_via")
  expect(physicalVias).toHaveLength(2)
  expect(physicalVias.every((via) => via.to_layer === "inner1")).toBe(true)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = converter.getOutput()
  expect(pcb.vias).toHaveLength(physicalVias.length)
  for (const [index, via] of pcb.vias.entries()) {
    expect(via.layers?.names).toEqual(["F.Cu", "B.Cu"])
    expect(via.size).toBe(physicalVias[index]!.outer_diameter)
    expect(via.drill).toBe(physicalVias[index]!.hole_diameter)
  }
  expect(pcb.general?.thickness).toBe(0.8)

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
  })
  expect(snapshot.exitCode).toBe(0)
  expect(snapshot.generatedFileContent["temp_file.png"]!).toMatchPngSnapshot(
    import.meta.path,
  )
})
