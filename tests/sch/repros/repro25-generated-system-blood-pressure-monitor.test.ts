import { test } from "bun:test"
import { runGeneratedSystemRepro } from "../../fixtures/run-generated-system-repro"

test("repro25: convert the blood pressure monitor multisheet generated system", async () => {
  await runGeneratedSystemRepro({
    fixtureUrl: new URL(
      "../../assets/repro25-generated-system-blood-pressure-monitor.circuit.json",
      import.meta.url,
    ),
    rootFilename: "blood_pressure_monitor.kicad_sch",
    snapshotPath: import.meta.path,
    debugOutputName:
      "repro25-generated-system-blood-pressure-monitor.stacked.png",
    expectedSheetNames: [
      "Input + Reference",
      "Connectors + Jumpers + Test Points",
      "Programming",
      "INA + Filter",
      "MCU",
      "Pressure Sensor + ADC Filter",
      "Motor Driver",
    ],
  })
}, 120_000)
