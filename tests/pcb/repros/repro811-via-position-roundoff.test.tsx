import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro811: route via position roundoff exports a duplicate via", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="6mm" height="4mm" layers={4} schematicDisabled>
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0402"
        pcbX={2}
        layer="bottom"
      />
      <trace
        from=".R1 > .pin2"
        to=".R2 > .pin1"
        pcbPathRelativeTo=".R1 > .pin2"
        pcbPath={[
          { x: 1.5, y: 1, via: true, fromLayer: "top", toLayer: "bottom" },
          { x: 3, y: 0 },
        ]}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const physicalVias = circuitJson.filter(
    (element) => element.type === "pcb_via",
  )
  expect(physicalVias).toHaveLength(1)
  const physicalVia = physicalVias[0]!
  const routeVia = circuitJson
    .filter((element) => element.type === "pcb_trace")
    .flatMap((trace) => trace.route)
    .find((point) => point.route_type === "via")!

  expect(routeVia.y).toBe(physicalVia.y)
  // Reproduce the one-step coordinate roundoff from the NEMA23 export.
  // The route and physical via still describe the same hole.
  routeVia.y += Number.EPSILON
  expect(routeVia.y).not.toBe(physicalVia.y)
  const originalCircuitJson = structuredClone(circuitJson)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  expect(circuitJson).toEqual(originalCircuitJson)
  const vias = converter.getOutput().vias
  expect(vias).toHaveLength(physicalVias.length)
  expect(vias.map((via) => via.getString()).join("\n\n")).toMatchSnapshot()

  // Cross x/y bucket boundaries separately, and diagonal neighbors at zero.
  // Outside-tolerance pairs also use neighboring buckets, so lookup finds the
  // candidate and the distance check must keep the two via objects separate.
  for (const [scenario, physicalPosition, routePosition, expectedViaCount] of [
    [
      "positive x bucket boundary",
      [0.9999999999e-6, 0],
      [1.0000000001e-6, 0],
      1,
    ],
    [
      "negative y bucket boundary",
      [0, -0.9999999999e-6],
      [0, -1.0000000001e-6],
      1,
    ],
    ["opposite sides of zero", [-1e-10, -1e-10], [1e-10, 1e-10], 1],
    ["inclusive per-axis tolerance", [-0.5e-6, -0.5e-6], [0.5e-6, 0.5e-6], 1],
    ["just outside x tolerance", [-0.5e-6, 0], [0.500001e-6, 0], 2],
    ["just outside y tolerance", [0, 0.5e-6], [0, -0.500001e-6], 2],
  ] as const) {
    const caseCircuitJson = structuredClone(originalCircuitJson)
    const casePhysicalVia = caseCircuitJson.find(
      (element) => element.type === "pcb_via",
    )!
    const caseRouteVia = caseCircuitJson
      .filter((element) => element.type === "pcb_trace")
      .flatMap((trace) => trace.route)
      .find((point) => point.route_type === "via")!

    casePhysicalVia.x = physicalPosition[0]
    casePhysicalVia.y = physicalPosition[1]
    caseRouteVia.x = routePosition[0]
    caseRouteVia.y = routePosition[1]

    const caseConverter = new CircuitJsonToKicadPcbConverter(caseCircuitJson)
    caseConverter.runUntilFinished()
    expect({
      scenario,
      viaCount: caseConverter.getOutput().vias.length,
    }).toEqual({
      scenario,
      viaCount: expectedViaCount,
    })
  }

  const { x, y } = vias[0]!.at!
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "pcb",
    pcbLayers: ["F.Cu", "B.Cu"],
    pcbDrillHoleColor: "white",
    pcbViewport: { x: x - 0.8, y: y - 0.8, width: 1.6, height: 1.6 },
    generatePng: false,
  })
  expect(snapshot.exitCode).toBe(0)

  // Coincident vias look identical in a board render. Show the exported count
  // above the close-up so the snapshot exposes the otherwise hidden duplicate.
  const label = Buffer.from(`
    <svg width="480" height="64">
      <text x="16" y="26" fill="white" font-family="sans-serif" font-size="20">
        Physical vias: ${physicalVias.length} | Exported vias: ${vias.length}
      </text>
      <text x="16" y="52" fill="white" font-family="sans-serif" font-size="16">
        1.6 mm close-up of the shared via position
      </text>
    </svg>
  `)
  const png = await sharp(snapshot.generatedFileContent["temp_file.svg"]!)
    .resize(480, 480)
    .flatten({ background: "black" })
    .extend({ top: 64, bottom: 0, left: 0, right: 0, background: "black" })
    .composite([{ input: label, top: 0, left: 0 }])
    .png()
    .toBuffer()
  await expect(png).toMatchPngSnapshot(import.meta.path)
}, 120000)
