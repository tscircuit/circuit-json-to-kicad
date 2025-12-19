import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadLibraryConverter } from "lib/kicad-library/CircuitJsonToKicadLibraryConverter"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import * as path from "node:path"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"
import "../fixtures/png-matcher"

test(
  "kicad library generates valid symbols, footprints with 3D models",
  async () => {
    const stepFilePath = path.resolve(
      __dirname,
      "../assets/SW_Push_1P1T_NO_CK_KMR2.step",
    )

    // Create a circuit with a chip that has a 3D model
    const circuit = new Circuit()
    circuit.add(
      <board width="20mm" height="20mm">
        <resistor
          name="R1"
          resistance="1k"
          footprint="0402"
          pcbX={-5}
          pcbY={0}
        />
        <capacitor
          name="C1"
          capacitance="1uF"
          footprint="0603"
          pcbX={0}
          pcbY={0}
          connections={{ pin1: "R1.pin2" }}
        />
        <chip
          name="U1"
          footprint="soic8"
          pcbX={5}
          pcbY={0}
          cadModel={<cadmodel modelUrl={stepFilePath} />}
          pinLabels={{
            pin1: "VCC",
            pin2: "GND",
            pin3: "IN",
            pin4: "OUT",
          }}
        />
      </board>,
    )

    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()

    // Generate library
    const libraryConverter = new CircuitJsonToKicadLibraryConverter(
      circuitJson as any,
      {
        libraryName: "test_library",
        footprintLibraryName: "test_library",
      },
    )
    libraryConverter.runUntilFinished()

    const output = libraryConverter.getOutput()

    // Verify symbol library structure
    expect(output.kicadSymString).toContain("kicad_symbol_lib")
    expect(output.kicadSymString).toContain("version")
    expect(output.kicadSymString).toContain("generator")

    // Verify footprints exist
    expect(output.footprints.length).toBeGreaterThanOrEqual(3)
    for (const fp of output.footprints) {
      expect(fp.kicadModString).toContain("footprint")
      expect(fp.kicadModString).toContain("pad")
    }

    // Verify 3D model in chip footprint
    const chipFootprint = output.footprints.find((fp) =>
      fp.footprintName.includes("chip"),
    )
    expect(chipFootprint).toBeDefined()
    expect(chipFootprint!.kicadModString).toContain("(model")
    expect(chipFootprint!.kicadModString).toContain("test_library.3dshapes")

    // Verify 3D model source paths
    expect(output.model3dSourcePaths.length).toBeGreaterThan(0)

    // Verify library tables
    expect(output.fpLibTableString).toContain("fp_lib_table")
    expect(output.fpLibTableString).toContain("test_library")
    expect(output.symLibTableString).toContain("sym_lib_table")
    expect(output.symLibTableString).toContain("test_library")

    // PCB Snapshot
    const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
    pcbConverter.runUntilFinished()

    const pcbSnapshot = await takeKicadSnapshot({
      kicadFileContent: pcbConverter.getOutputString(),
      kicadFileType: "pcb",
    })
    expect(pcbSnapshot.exitCode).toBe(0)

    expect(
      stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
        pcbSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path, "pcb")

    // Schematic Snapshot
    const schConverter = new CircuitJsonToKicadSchConverter(circuitJson as any)
    schConverter.runUntilFinished()

    const schSnapshot = await takeKicadSnapshot({
      kicadFileContent: schConverter.getOutputString(),
      kicadFileType: "sch",
    })
    expect(schSnapshot.exitCode).toBe(0)

    expect(
      stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
        schSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path, "sch")
  },
  { timeout: 30000 },
)
