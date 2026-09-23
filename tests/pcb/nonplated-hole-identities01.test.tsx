import { expect, test } from "bun:test"
import { Circuit } from "tscircuit-latest"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

test("non-plated holes have stable distinct IDs across repeated PCB exports", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={32} height={22} routingDisabled>
      <hole pcbX={-10} pcbY={5} diameter={2} />
      <hole pcbX={-10} pcbY={-5} shape="pill" width={3} height={1.5} />
      <chip
        name="U1"
        pcbX={4}
        pcbY={4}
        pcbRotation={45}
        footprint={
          <footprint>
            <smtpad shape="rect" width={1} height={1} portHints={["1"]} />
            <hole pcbX={3} pcbY={1} diameter={2} />
            <hole pcbX={-3} pcbY={-1} diameter={1} />
          </footprint>
        }
      />
      <chip
        name="U2"
        pcbX={4}
        pcbY={-5}
        pcbRotation={90}
        layer="bottom"
        footprint={
          <footprint>
            <smtpad shape="rect" width={1} height={1} portHints={["1"]} />
            {/* Coincident but distinct source records must not share an identity. */}
            <hole pcbX={2} pcbY={0} diameter={1.5} />
            <hole pcbX={2} pcbY={0} diameter={1.5} />
          </footprint>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(circuitJson.filter((e) => e.type === "pcb_hole")).toHaveLength(6)
  const convert = (input: typeof circuitJson) => {
    const converter = new CircuitJsonToKicadPcbConverter(input)
    converter.runUntilFinished()
    return converter.getOutputString()
  }
  const outputString = convert(circuitJson)
  const pcb = parseKicadPcb(outputString)
  const getHoleIds = (output: string) =>
    parseKicadPcb(output)
      .footprints.flatMap((f) =>
        f.fpPads
          .filter((p) => p.padType === "np_thru_hole")
          .map((p) => p.uuid!.value),
      )
      .sort()
  const holeIds = getHoleIds(outputString)
  expect(holeIds).toHaveLength(6)
  expect(new Set(holeIds).size).toBe(6)
  for (const id of holeIds)
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  expect(getHoleIds(convert(circuitJson))).toEqual(holeIds)
  // Compare complete files so UUID churn cannot hide behind a visual snapshot.
  expect(convert(circuitJson)).toBe(outputString)
  expect(convert(circuitJson)).toBe(outputString)
  // Identity belongs to the source element, not to enumeration order.
  expect(getHoleIds(convert([...circuitJson].reverse()))).toEqual(holeIds)
  for (const pad of pcb.footprints
    .flatMap((f) => f.fpPads)
    .filter((p) => p.padType === "np_thru_hole")) {
    expect(pad.number).toBe("")
    expect(pad.drill).toBeDefined()
  }
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
  })
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      snapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 31_000)
