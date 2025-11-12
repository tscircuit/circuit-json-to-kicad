import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("pcb nets derive from source connectivity keys", async () => {
  const circuitJson = await Bun.file(
    "tests/assets/555-timer-circuit.json",
  ).json()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const pcb = converter.getOutput()
  const pcbNetMap = converter.ctx.pcbNetMap

  expect(pcbNetMap).toBeDefined()

  const expectedConnectivityKeys = new Set<string>()

  for (const sourceNet of converter.ctx.db.source_net.list()) {
    if (sourceNet.subcircuit_connectivity_map_key) {
      expectedConnectivityKeys.add(sourceNet.subcircuit_connectivity_map_key)
    }
  }

  for (const sourceTrace of converter.ctx.db.source_trace.list()) {
    if (sourceTrace.subcircuit_connectivity_map_key) {
      expectedConnectivityKeys.add(sourceTrace.subcircuit_connectivity_map_key)
    }
  }

  expect(expectedConnectivityKeys.size).toBeGreaterThan(0)

  for (const connectivityKey of expectedConnectivityKeys) {
    expect(pcbNetMap?.has(connectivityKey)).toBe(true)
  }

  const netIds = new Set<number>()

  for (const [connectivityKey, netInfo] of pcbNetMap ?? []) {
    expect(connectivityKey.startsWith("Net-")).toBe(false)

    netIds.add(netInfo.id)

    const matchingNet = pcb.nets.find((net) => net.id === netInfo.id)
    expect(matchingNet).toBeDefined()
    expect(matchingNet!.name).toBe(netInfo.name)
  }

  const padsWithNets = pcb.footprints
    .flatMap((footprint) => footprint.fpPads)
    .filter((pad) => pad.net)

  expect(padsWithNets.length).toBeGreaterThan(0)

  for (const pad of padsWithNets) {
    expect(pad.net).toBeDefined()
    expect(netIds.has(pad.net!.id)).toBe(true)
  }

  const segmentsWithNets = pcb.segments.filter((segment) => segment.net)
  expect(segmentsWithNets.length).toBeGreaterThan(0)

  for (const segment of segmentsWithNets) {
    expect(netIds.has(segment.net!.id)).toBe(true)
  }

  const viasWithNets = pcb.vias.filter(
    (via) => via.net && via.net.id !== undefined && via.net.id > 0,
  )
  expect(viasWithNets.length).toBeGreaterThan(0)

  for (const via of viasWithNets) {
    expect(netIds.has(via.net!.id)).toBe(true)
  }
})
