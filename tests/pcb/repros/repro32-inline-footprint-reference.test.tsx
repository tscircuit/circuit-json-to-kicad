import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test(
  "pcb repro32 inline footprint omits reference designator (issue #227)",
  async () => {
    const circuit = new Circuit()
    circuit.add(
      <board width="10mm" height="10mm" routingDisabled>
        <chip
          name="U1"
          footprint={
            <footprint>
              <smtpad
                portHints={["pin1"]}
                pcbX="-1mm"
                width="1mm"
                height="1mm"
                shape="rect"
              />
              <smtpad
                portHints={["pin2"]}
                pcbX="1mm"
                width="1mm"
                height="1mm"
                shape="rect"
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

    const footprint = converter.getOutput().footprints[0]
    const sourceComponent = circuitJson.find(
      (element) => element.type === "source_component",
    )

    expect({
      sourceComponentName: sourceComponent?.name,
      referenceProperty: footprint?.properties.find(
        (property) => property.key === "Reference",
      )?.value,
      referenceText: footprint?.fpTexts.find(
        (text) => text.type === "reference",
      )?.text,
    }).toMatchSnapshot()

    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: converter.getOutputString(),
      kicadFileType: "pcb",
    })

    expect(kicadSnapshot.exitCode).toBe(0)

    expect(
      stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({
          circuitJson,
          outputType: "pcb",
        }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 120_000 },
)
