import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("pcb basics15 plated hole shapes", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="50mm">
      {/* 1. Circle */}
      <platedhole
        pcbX={-10}
        pcbY={20}
        shape="circle"
        holeDiameter="2mm"
        outerDiameter="4mm"
      />

      {/* 2. Pill / Oval */}
      <platedhole
        pcbX={10}
        pcbY={20}
        shape="pill"
        holeWidth="2mm"
        holeHeight="4mm"
        outerWidth="4mm"
        outerHeight="6mm"
      />

      {/* 3. Pill hole with rect pad */}

      <platedhole
        pcbX={-10}
        pcbY={0}
        shape="pill_hole_with_rect_pad"
        holeWidth="2mm"
        holeHeight="4mm"
        rectPadWidth="4mm"
        rectPadHeight="6mm"
      />

      {/* 4. Circular hole with rect pad */}
      <platedhole
        pcbX={10}
        pcbY={0}
        shape="circular_hole_with_rect_pad"
        holeDiameter="2mm"
        rectPadWidth="4mm"
        rectPadHeight="6mm"
      />
      <platedhole
        pcbX={0}
        pcbY={-20}
        shape="circular_hole_with_rect_pad"
        holeDiameter="2mm"
        rectPadWidth="6mm"
        rectPadHeight="4mm"
        pcbRotation={45}
      />

      {/* 5. Rotated pill hole with rect pad */}
      <platedhole
        pcbX={10}
        pcbY={-20}
        shape="pill_hole_with_rect_pad"
        holeWidth="4mm"
        holeHeight="2mm"
        rectPadWidth="6mm"
        rectPadHeight="4mm"
        pcbRotation={45}
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson: circuitJson,
        outputType: "pcb",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
