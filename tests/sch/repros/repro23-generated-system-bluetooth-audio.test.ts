import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { runGeneratedSystemRepro } from "../../fixtures/run-generated-system-repro"

test("repro23: convert the Bluetooth audio generated system", async () => {
  await runGeneratedSystemRepro({
    fixtureUrl: new URL(
      "../../assets/repro23-generated-system-bluetooth-audio.circuit.json",
      import.meta.url,
    ),
    rootFilename: "bluetooth_audio_system.kicad_sch",
    snapshotPath: import.meta.path,
    debugOutputName: "repro23-generated-system-bluetooth-audio.stacked.png",
    assertKicadSchematicFiles: (files) => {
      const power = files.find(
        (file) => file.filename === "power_1v8.kicad_sch",
      )!
      // Reuse existing labels, including aliases for nets without source_net rows.
      expect(
        parseKicadSch(power.content).globalLabels.map((label) => label.value),
      ).toEqual(["U1_VSS", "U1_VOUT", "U1_OUT"])
    },
    expectedSheetNames: [
      "TAS2505 Audio Amplifier",
      "CC2564C Bluetooth Controller",
      "MSP430F5229 Bluetooth Audio Host",
      "BQ24074 Battery Management",
      "TPS7A2018 1.8 V LDO",
    ],
  })
}, 120_000)
