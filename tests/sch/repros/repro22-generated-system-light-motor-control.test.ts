import { test } from "bun:test"
import { runGeneratedSystemRepro } from "../../fixtures/run-generated-system-repro"

test("repro22: convert the light and motor control generated system", async () => {
  await runGeneratedSystemRepro({
    fixtureUrl: new URL(
      "../../assets/repro22-generated-system-light-motor-control.circuit.json",
      import.meta.url,
    ),
    rootFilename: "light_motor_control_system.kicad_sch",
    snapshotPath: import.meta.path,
    debugOutputName: "repro22-generated-system-light-motor-control.stacked.png",
    expectedSheetNames: [
      "TCAN1042 CAN Interface",
      "TIDA-01330 Light Driver",
      "MSPM0L1306-Q1 Microcontroller",
      "TIDA-01330 DRV8305 Motor Driver",
      "TIDA-01389 Position Feedback",
      "TIDA-00992 LM5050-Q1 Power Supply",
    ],
  })
}, 120_000)
