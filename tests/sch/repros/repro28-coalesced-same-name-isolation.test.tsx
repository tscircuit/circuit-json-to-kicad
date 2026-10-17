import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import { getCoalescedTraceNetLabels } from "lib/schematic/stages/utils/getCoalescedTraceNetLabels"
import { createCoalescedNetCircuit } from "../../fixtures/create-coalesced-net-circuit"

test("independently keyed nets with the same name do not short on one sheet", async () => {
  // Circuit generates both coalesced islands on one SIGNAL source net. Derive
  // a valid name-collision input by giving the second generated island its own
  // source-net identity and connectivity key; wire geometry and components
  // remain Circuit-generated.
  const circuitJson = structuredClone(
    await createCoalescedNetCircuit([
      {
        name: "signal_scope",
        pairs: [
          {
            firstRef: "R1",
            firstPin: 2,
            secondRef: "R2",
            secondPin: 1,
            x: 0,
          },
          {
            firstRef: "R3",
            firstPin: 2,
            secondRef: "R4",
            secondPin: 1,
            x: 20,
          },
        ],
      },
    ]),
  ) as CircuitJson
  const sourceNet = circuitJson.find(
    (
      element,
    ): element is Extract<CircuitJson[number], { type: "source_net" }> =>
      element.type === "source_net" && element.name === "SIGNAL",
  )!
  const sourceComponents = circuitJson.filter(
    (
      element,
    ): element is Extract<CircuitJson[number], { type: "source_component" }> =>
      element.type === "source_component",
  )
  const secondComponentIds = new Set(
    sourceComponents
      .filter((component) => component.name === "R3" || component.name === "R4")
      .map((component) => component.source_component_id),
  )
  const secondPortIds = new Set(
    circuitJson
      .filter(
        (
          element,
        ): element is Extract<CircuitJson[number], { type: "source_port" }> =>
          element.type === "source_port",
      )
      .filter(
        (port) =>
          port.source_component_id != null &&
          secondComponentIds.has(port.source_component_id),
      )
      .map((port) => port.source_port_id),
  )
  const secondKey = "derived_independent_SIGNAL_connectivity"
  const secondSubcircuit = "derived_independent_SIGNAL_subcircuit"
  const secondNetId = "derived_independent_SIGNAL_source_net"
  const secondNet = {
    ...sourceNet,
    source_net_id: secondNetId,
    subcircuit_id: secondSubcircuit,
    subcircuit_connectivity_map_key: secondKey,
  }
  circuitJson.push(secondNet)

  for (const element of circuitJson) {
    if (
      element.type === "source_port" &&
      secondPortIds.has(element.source_port_id)
    ) {
      element.subcircuit_id = secondSubcircuit
      element.subcircuit_connectivity_map_key = secondKey
    }
    if (
      element.type === "source_trace" &&
      element.connected_source_port_ids.some((id) => secondPortIds.has(id))
    ) {
      element.subcircuit_id = secondSubcircuit
      element.subcircuit_connectivity_map_key = secondKey
      element.connected_source_net_ids = [secondNetId]
    }
    if (
      element.type === "schematic_trace" &&
      (element.edges.some((edge) => edge.from.x > 10 && edge.to.x > 10) ||
        circuitJson.some(
          (sourceTrace) =>
            sourceTrace.type === "source_trace" &&
            sourceTrace.source_trace_id === element.source_trace_id &&
            sourceTrace.connected_source_port_ids.some((id) =>
              secondPortIds.has(id),
            ),
        ))
    ) {
      element.subcircuit_id = secondSubcircuit
      element.subcircuit_connectivity_map_key = secondKey
    }
  }

  const nets = circuitJson.filter(
    (element) => element.type === "source_net" && element.name === "SIGNAL",
  )
  expect(nets).toHaveLength(2)
  expect(getCoalescedTraceNetLabels(circuitJson)).toHaveLength(0)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const tempDir = await mkdtemp(join(tmpdir(), "coalesced-name-collision-"))
  try {
    const schematicPath = join(tempDir, "same-name.kicad_sch")
    const netlistPath = join(tempDir, "same-name.xml")
    await writeFile(schematicPath, converter.getOutputString())
    const result = Bun.spawnSync([
      "kicad-cli",
      "sch",
      "export",
      "netlist",
      "--format",
      "kicadxml",
      "--output",
      netlistPath,
      schematicPath,
    ])
    expect(result.exitCode).toBe(0)
    const netlist = await readFile(netlistPath, "utf8")
    const netPartition = [...netlist.matchAll(/<net\b[^>]*>([\s\S]*?)<\/net>/g)]
      .map(([, body]) =>
        [...body!.matchAll(/<node\b[^>]*ref="([^"]+)"[^>]*pin="([^"]+)"/g)]
          .map(([, ref, pin]) => `${ref}.${pin}`)
          .sort(),
      )
      .filter((members) => members.length > 0)
      .sort((a, b) => a.join(",").localeCompare(b.join(",")))
    expect(
      [...netlist.matchAll(/<comp ref="([^"]+)"/g)]
        .map(([, ref]) => ref)
        .sort(),
    ).toEqual(["R1", "R2", "R3", "R4"])
    expect(netPartition).toEqual([
      ["R1.1"],
      ["R1.2", "R2.1"],
      ["R2.2"],
      ["R3.1"],
      ["R3.2", "R4.1"],
      ["R4.2"],
    ])
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}, 120_000)
