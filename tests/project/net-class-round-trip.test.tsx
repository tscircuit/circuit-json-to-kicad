import { expect, test } from "bun:test"
import "bun-match-svg"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Circuit } from "@tscircuit/core"
import { any_circuit_element, type CircuitJson } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadProConverter,
} from "lib"

async function createExports() {
  const circuit = new Circuit()
  circuit.add(
    <board width={26} height={20} schMaxTraceDistance={100}>
      <netclass name="Default" traceWidth="0.2mm" nets={[]} />
      <netclass name="Inherited" priority={0} nets={["net.VCC"]} />
      <netclass
        name="Power"
        priority={1}
        traceWidth="0.8mm"
        nets={["net.VCC"]}
      />
      <netclass
        name="Sense"
        priority={2}
        traceWidth="0.8mm"
        nets={["net.SENSE"]}
      />
      <netclass name="Unused" priority={3} traceWidth="0.4mm" nets={[]} />
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-5} pcbY={3} />
      <resistor name="R2" resistance="1k" footprint="0402" pcbX={5} pcbY={3} />
      <resistor
        name="R3"
        resistance="1k"
        footprint="0402"
        pcbX={-5}
        pcbY={-3}
      />
      <resistor name="R4" resistance="1k" footprint="0402" pcbX={5} pcbY={-3} />
      <trace from=".R1 > .pin2" to="net.VCC" />
      <trace from=".R2 > .pin1" to="net.VCC" />
      <trace from=".R3 > .pin2" to="net.SENSE" />
      <trace from=".R4 > .pin1" to="net.SENSE" />
      <pcbnotetext pcbY={7} text="VCC: Inherited + Power, 0.8 mm" />
      <pcbnotetext pcbY={-7} text="SENSE: Sense, 0.8 mm" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const authored = circuit
    .getCircuitJson()
    .map((element) => any_circuit_element.parse(element))
  const pcb = new CircuitJsonToKicadPcbConverter(authored)
  pcb.runUntilFinished()
  const project = new CircuitJsonToKicadProConverter(authored, {
    projectName: "classes",
  })
  return {
    authored,
    pcb: pcb.getOutputString(),
    project: project.getOutputString(),
  }
}

function classState(circuitJson: CircuitJson) {
  const classes = circuitJson.filter(
    (element) => element.type === "source_net_class",
  )
  return {
    classes: classes
      .map((netClass) => ({
        name: netClass.name,
        width: netClass.trace_width,
        priority:
          netClass.name === "Default" ? 2147483647 : (netClass.priority ?? 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    nets: circuitJson
      .filter((element) => element.type === "source_net")
      .filter((net) => ["VCC", "SENSE"].includes(net.name))
      .map((net) => ({
        name: net.name,
        width: net.trace_width,
        classes: net.source_net_class_ids
          ?.map(
            (id) =>
              classes.find((netClass) => netClass.source_net_class_id === id)
                ?.name,
          )
          .filter((name) => name !== "Default"),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

test("native authored classes survive serialized KiCad export and re-import", async () => {
  const exported = await createExports()
  const importer = new KicadToCircuitJsonConverter()
  importer.addFile("classes.kicad_pcb", exported.pcb)
  importer.addFile("classes.kicad_pro", exported.project)
  importer.runUntilFinished()
  const imported = importer
    .getOutput()
    .map((element) => any_circuit_element.parse(element))
  expect(classState(imported)).toEqual(classState(exported.authored))
  expect(classState(imported).nets).toEqual([
    { name: "SENSE", width: 0.8, classes: ["Sense"] },
    { name: "VCC", width: 0.8, classes: ["Inherited", "Power"] },
  ])
  const restored = new Circuit()
  restored.add(
    <board width={26} height={20} routingDisabled schematicDisabled>
      <subcircuit
        name="RESTORED"
        circuitJson={JSON.parse(JSON.stringify(imported))}
      />
    </board>,
  )
  await restored.renderUntilSettled()
  expect(classState(restored.getCircuitJson())).toEqual(
    classState(exported.authored),
  )
  await expect(convertCircuitJsonToPcbSvg(imported)).toMatchSvgSnapshot(
    import.meta.path,
    "round-trip",
  )
})

test.skipIf(!Bun.which("kicad-cli"))(
  "KiCad itself loads the exported class assignments",
  async () => {
    const exported = await createExports()
    const directory = await mkdtemp(join(tmpdir(), "net-class-round-trip-"))
    try {
      const pcbPath = join(directory, "classes.kicad_pcb")
      const reportPath = join(directory, "report.json")
      await writeFile(pcbPath, exported.pcb)
      await writeFile(join(directory, "classes.kicad_pro"), exported.project)
      const probes = [
        ["VCC", "Power"],
        ["VCC", "Inherited"],
        ["SENSE", "Sense"],
        ["VCC", "Sense"],
        ["SENSE", "Power"],
      ]
      await writeFile(
        join(directory, "classes.kicad_dru"),
        `(version 1)\n${probes.map(([net, netClass]) => `(rule "probe_${net}_${netClass}" (condition "A.Type == 'Track' && A.NetName == '${net}' && A.hasNetclass('${netClass}')") (constraint assertion "A.hasNetclass('NO_SUCH_CLASS')"))`).join("\n")}`,
      )
      const result = Bun.spawnSync([
        "kicad-cli",
        "pcb",
        "drc",
        "--format",
        "json",
        "--severity-all",
        "--output",
        reportPath,
        pcbPath,
      ])
      expect(result.exitCode).toBe(0)
      const report = JSON.parse(await Bun.file(reportPath).text()) as {
        violations: Array<{ type: string; description: string }>
      }
      const actual = Array.from(
        new Set(
          report.violations
            .filter((violation) => violation.type === "assertion_failure")
            .map((violation) => /probe_(\w+)/.exec(violation.description)?.[1]),
        ),
      ).sort()
      expect(actual).toEqual(["SENSE_Sense", "VCC_Inherited", "VCC_Power"])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)
