import { expect, test } from "bun:test"
import sharp from "sharp"
import { createElement } from "react"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro36: an inner-layer route hop does not duplicate its standalone through-via", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={8} height={6} layers={4}>
      <via
        name="V1"
        holeDiameter={0.2}
        outerDiameter={0.45}
        fromLayer="top"
        toLayer="bottom"
      />
      {createElement("pcbtrace", {
        route: [
          { route_type: "wire", x: -3, y: 0, width: 0.15, layer: "top" },
          { route_type: "wire", x: 0, y: 0, width: 0.15, layer: "top" },
          {
            route_type: "via",
            x: 0,
            y: 0,
            from_layer: "top",
            to_layer: "inner1",
          },
          { route_type: "wire", x: 0, y: 0, width: 0.15, layer: "inner1" },
          { route_type: "wire", x: 3, y: 0, width: 0.15, layer: "inner1" },
        ],
      })}
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson.filter((element) => element.type === "pcb_via"),
  ).toHaveLength(1)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  expect(converter.getOutput().vias).toHaveLength(1)
  expect(
    converter
      .getOutput()
      .vias.map((via) => ({ size: via.size, drill: via.drill })),
  ).toEqual([{ size: 0.45, drill: 0.2 }])

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
    generatePng: false,
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  const snapshotSize = { width: 800, height: 600 }
  const circuitJsonPng = await sharp(
    await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
  )
    .trim({ background: "black" })
    .resize(snapshotSize)
    .png()
    .toBuffer()
  const kicadPng = await sharp(
    kicadSnapshot.generatedFileContent["temp_file.svg"]!,
    { density: 600 },
  )
    .flatten({ background: "black" })
    .trim({ background: "black" })
    .resize(snapshotSize)
    .png()
    .toBuffer()
  await expect(
    stackCircuitJsonKicadPngs(circuitJsonPng, kicadPng),
  ).toMatchPngSnapshot(import.meta.path)
})
