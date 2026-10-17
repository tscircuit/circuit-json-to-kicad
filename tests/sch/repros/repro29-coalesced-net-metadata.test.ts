import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { getCoalescedTraceNetLabels } from "lib/schematic/stages/utils/getCoalescedTraceNetLabels"
import { createCoalescedNetCircuit } from "../../fixtures/create-coalesced-net-circuit"

test("coalesced net inference requires one unambiguous source identity", async () => {
  const generated = await createCoalescedNetCircuit([
    {
      name: "signal_scope",
      pairs: [
        { firstRef: "R1", firstPin: 2, secondRef: "R2", secondPin: 1, x: 0 },
        { firstRef: "R3", firstPin: 2, secondRef: "R4", secondPin: 1, x: 20 },
      ],
    },
  ])
  const circuitJson = structuredClone(generated) as CircuitJson
  const traces = circuitJson.filter(
    (
      element,
    ): element is Extract<CircuitJson[number], { type: "schematic_trace" }> =>
      element.type === "schematic_trace",
  )
  const nets = circuitJson.filter(
    (
      element,
    ): element is Extract<CircuitJson[number], { type: "source_net" }> =>
      element.type === "source_net",
  )
  expect(nets.some((net) => net.name === "SIGNAL")).toBe(true)
  const syntheticTraces = traces.filter((trace) =>
    trace.source_trace_id?.startsWith("schematic_port_"),
  )
  expect(syntheticTraces).toHaveLength(2)

  const inferred = getCoalescedTraceNetLabels(circuitJson)
  expect(inferred).toHaveLength(2)
  expect(new Set(inferred.map((label) => label.value))).toEqual(
    new Set(["SIGNAL"]),
  )
  expect(new Set(inferred.map((label) => label.schematic_trace_id))).toEqual(
    new Set(syntheticTraces.map((trace) => trace.schematic_trace_id)),
  )
  expect(inferred.every((label) => label.rotation === 0)).toBe(true)
  expect(
    inferred.every((label) =>
      syntheticTraces.some(
        (trace) => trace.schematic_trace_id === label.schematic_trace_id,
      ),
    ),
  ).toBe(true)
  expect(
    inferred.every((label) =>
      traces.some(
        (trace) =>
          trace.schematic_trace_id === label.schematic_trace_id &&
          trace.edges.some((edge) =>
            [edge.from, edge.to].some(
              (point) =>
                point.x === label.anchor_position.x &&
                point.y === label.anchor_position.y,
            ),
          ),
      ),
    ),
  ).toBe(true)

  const missingKey = structuredClone(circuitJson) as CircuitJson
  const missingKeyTrace = missingKey.find(
    (element) =>
      element.type === "schematic_trace" &&
      element.source_trace_id?.startsWith("schematic_port_"),
  ) as Extract<CircuitJson[number], { type: "schematic_trace" }>
  delete missingKeyTrace.subcircuit_connectivity_map_key
  expect(getCoalescedTraceNetLabels(missingKey)).toHaveLength(1)

  const mismatchedScope = structuredClone(circuitJson) as CircuitJson
  const mismatchedTrace = mismatchedScope.find(
    (element) =>
      element.type === "schematic_trace" &&
      element.source_trace_id?.startsWith("schematic_port_"),
  ) as Extract<CircuitJson[number], { type: "schematic_trace" }>
  mismatchedTrace.subcircuit_id = "unrelated_scope"
  expect(getCoalescedTraceNetLabels(mismatchedScope)).toHaveLength(1)

  for (const invalidEdges of [
    [{ from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }],
    [{ from: { x: Number.NaN, y: 0 }, to: { x: 1, y: 0 } }],
  ]) {
    const invalidGeometry = structuredClone(circuitJson) as CircuitJson
    const invalidTrace = invalidGeometry.find(
      (element) =>
        element.type === "schematic_trace" &&
        element.source_trace_id?.startsWith("schematic_port_"),
    ) as Extract<CircuitJson[number], { type: "schematic_trace" }>
    invalidTrace.edges = invalidEdges
    expect(getCoalescedTraceNetLabels(invalidGeometry)).toHaveLength(1)
  }

  const orientations = structuredClone(circuitJson) as CircuitJson
  const orientationTraces = orientations.filter(
    (
      element,
    ): element is Extract<CircuitJson[number], { type: "schematic_trace" }> =>
      element.type === "schematic_trace" &&
      element.source_trace_id?.startsWith("schematic_port_") === true,
  )
  orientationTraces[0]!.edges = [{ from: { x: 5, y: 5 }, to: { x: 0, y: 5 } }]
  orientationTraces[1]!.edges = [{ from: { x: 2, y: 0 }, to: { x: 2, y: 4 } }]
  const orientedLabels = getCoalescedTraceNetLabels(orientations)
  expect(
    orientedLabels.find(
      (label) =>
        label.schematic_trace_id === orientationTraces[0]!.schematic_trace_id,
    ),
  ).toMatchObject({ anchor_position: { x: 0, y: 5 }, rotation: 0 })
  expect(
    orientedLabels.find(
      (label) =>
        label.schematic_trace_id === orientationTraces[1]!.schematic_trace_id,
    ),
  ).toMatchObject({ anchor_position: { x: 2, y: 0 }, rotation: 90 })

  const missingName = structuredClone(circuitJson) as CircuitJson
  const missingNameNet = missingName.find(
    (element) => element.type === "source_net",
  ) as Extract<CircuitJson[number], { type: "source_net" }>
  missingNameNet.name = "   "
  expect(getCoalescedTraceNetLabels(missingName)).toHaveLength(0)

  const blankKey = structuredClone(circuitJson) as CircuitJson
  const blankKeyTrace = blankKey.find(
    (element) =>
      element.type === "schematic_trace" &&
      element.source_trace_id?.startsWith("schematic_port_"),
  ) as Extract<CircuitJson[number], { type: "schematic_trace" }>
  const blankKeyNet = blankKey.find(
    (element) => element.type === "source_net",
  ) as Extract<CircuitJson[number], { type: "source_net" }>
  blankKeyTrace.subcircuit_connectivity_map_key = "   "
  blankKeyNet.subcircuit_connectivity_map_key = "   "
  expect(getCoalescedTraceNetLabels(blankKey)).toHaveLength(0)

  const ambiguous = structuredClone(circuitJson) as CircuitJson
  const originalNet = ambiguous.find(
    (element) => element.type === "source_net",
  ) as Extract<CircuitJson[number], { type: "source_net" }>
  ambiguous.push({
    ...originalNet,
    source_net_id: "derived_ambiguous_source_net",
    name: "OTHER_SIGNAL",
  })
  expect(getCoalescedTraceNetLabels(ambiguous)).toHaveLength(0)

  // Duplicate identical records model a repeated name/key in derived input;
  // they must not create extra labels or extra netlist nodes.
  const repeatedIdentity = structuredClone(circuitJson) as CircuitJson
  const repeatedNet = repeatedIdentity.find(
    (element) => element.type === "source_net",
  ) as Extract<CircuitJson[number], { type: "source_net" }>
  repeatedIdentity.push({ ...repeatedNet })
  expect(getCoalescedTraceNetLabels(repeatedIdentity)).toHaveLength(2)

  const explicitlyLabeled = structuredClone(
    await createCoalescedNetCircuit([
      {
        name: "labelled_scope",
        explicitLabelAt: { ref: "R1", pin: 2 },
        pairs: [
          { firstRef: "R1", firstPin: 2, secondRef: "R2", secondPin: 1, x: 0 },
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
  const generatedLabels = explicitlyLabeled.filter(
    (
      element,
    ): element is Extract<
      CircuitJson[number],
      { type: "schematic_net_label" }
    > => element.type === "schematic_net_label",
  )
  expect(generatedLabels.length).toBeGreaterThan(0)

  const explicitAlias = structuredClone(explicitlyLabeled) as CircuitJson
  const aliasLabel = explicitAlias.find(
    (element) => element.type === "schematic_net_label",
  ) as Extract<CircuitJson[number], { type: "schematic_net_label" }>
  aliasLabel.source_net_id = "another_identity"
  expect(getCoalescedTraceNetLabels(explicitAlias)).toHaveLength(0)

  const explicitConflict = structuredClone(explicitlyLabeled) as CircuitJson
  const conflictLabel = explicitConflict.find(
    (element) => element.type === "schematic_net_label",
  ) as Extract<CircuitJson[number], { type: "schematic_net_label" }>
  conflictLabel.text = "OTHER_SIGNAL"
  expect(getCoalescedTraceNetLabels(explicitConflict)).toHaveLength(0)

  const existingLabelOnWire = structuredClone(explicitlyLabeled) as CircuitJson
  const labelOnWire = existingLabelOnWire.find(
    (element) => element.type === "schematic_net_label",
  ) as Extract<CircuitJson[number], { type: "schematic_net_label" }>
  const firstSynthetic = existingLabelOnWire.find(
    (element) =>
      element.type === "schematic_trace" &&
      element.source_trace_id?.startsWith("schematic_port_"),
  ) as Extract<CircuitJson[number], { type: "schematic_trace" }>
  labelOnWire.anchor_position = { ...firstSynthetic.edges[0]!.from }
  expect(getCoalescedTraceNetLabels(existingLabelOnWire)).toHaveLength(1)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const schematic = parseKicadSch(converter.getOutputString())
  expect(schematic.texts.filter((text) => text.value === "SIGNAL").length).toBe(
    circuitJson.filter(
      (element) =>
        element.type === "schematic_text" && element.text === "SIGNAL",
    ).length,
  )
}, 120_000)
