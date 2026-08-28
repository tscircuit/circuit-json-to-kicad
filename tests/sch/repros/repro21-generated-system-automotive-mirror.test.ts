import { test } from "bun:test"
import { runGeneratedSystemRepro } from "../../fixtures/run-generated-system-repro"

test("repro21: convert the automotive mirror generated system", async () => {
  await runGeneratedSystemRepro({
    fixtureUrl: new URL(
      "../../assets/repro21-generated-system-automotive-mirror.circuit.json",
      import.meta.url,
    ),
    rootFilename: "automotive_mirror_system.kicad_sch",
    snapshotPath: import.meta.path,
    debugOutputName: "repro21-generated-system-automotive-mirror.stacked.png",
    expectedSheetNames: [
      "TCAN1042 CAN Interface",
      "TIDA-00356 Lamp Driver",
      "TIDA-01539 Ambient Light Sensors",
      "MSPM0G3507 Microcontroller",
      "TIDA-01539 Electrochromic Mirror Driver",
      "LM74202 and TPS7E81-Q1 Power Supply",
      "LM50HV-Q1 Temperature Sensor",
    ],
  })
}, 120_000)
