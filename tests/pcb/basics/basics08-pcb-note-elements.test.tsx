import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test(
  "pcb_note_text and pcb_note_rect are converted to KiCad footprint elements",
  async () => {
    const circuit = new Circuit()
    circuit.add(
      <board width="20mm" height="20mm">
        <chip
          name="U1"
          footprint={
            <footprint>
              <smtpad
                portHints={["1"]}
                pcbX={0}
                pcbY={0}
                width="1mm"
                height="1mm"
                shape="rect"
              />
              <pcbnotetext
                pcbX={0}
                pcbY={2}
                text="Note Text"
                fontSize={0.5}
                anchorAlignment="center"
              />
              <pcbnoterect
                pcbX={0}
                pcbY={0}
                width={3}
                height={3}
                strokeWidth={0.1}
              />
            </footprint>
          }
        />
      </board>,
    )

    await circuit.renderUntilSettled()

    const circuitJson = circuit.getCircuitJson()

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()

    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: converter.getOutputString(),
      kicadFileType: "pcb",
    })

    expect(kicadSnapshot.exitCode).toBe(0)

    expect(
      stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 120000 },
)
