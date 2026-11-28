import type { PcbTrace } from "circuit-json"
import { FpLine, type FootprintPad, Stroke } from "kicadts"
import { applyToPoint, identity, rotate } from "transformation-matrix"
import { getKicadLayer } from "../../utils/layerMapping"

interface ConvertComponentBridgeTracesParams {
  bridgeTraces: PcbTrace[]
  componentCenter: { x: number; y: number }
  componentRotation?: number
  padNumberByPortId: Record<string, string>
  fpPads: FootprintPad[]
}

export function convertComponentBridgeTraces({
  bridgeTraces,
  componentCenter,
  componentRotation = 0,
  padNumberByPortId,
  fpPads,
}: ConvertComponentBridgeTracesParams): {
  fpLines: FpLine[]
  netTiePadGroups: string[]
} {
  const fpLines: FpLine[] = []
  const padGroups: Set<string>[] = []

  const rotationMatrix =
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : identity()

  for (const trace of bridgeTraces) {
    const route = trace.route
    if (!route || route.length < 2) continue

    const touchedPadNumbers = new Set<string>()
    let lastKnownLayer: string | undefined =
      "layer" in route[0]! ? route[0]!.layer : undefined

    for (let i = 0; i < route.length; i++) {
      const point = route[i]!
      if (
        "start_pcb_port_id" in point &&
        point.start_pcb_port_id &&
        padNumberByPortId[point.start_pcb_port_id]
      ) {
        touchedPadNumbers.add(padNumberByPortId[point.start_pcb_port_id]!)
      }
      if (
        "end_pcb_port_id" in point &&
        point.end_pcb_port_id &&
        padNumberByPortId[point.end_pcb_port_id]
      ) {
        touchedPadNumbers.add(padNumberByPortId[point.end_pcb_port_id]!)
      }
    }

    for (let i = 0; i < route.length - 1; i++) {
      const startPoint = route[i]!
      const endPoint = route[i + 1]!
      if (
        !("x" in startPoint && "y" in startPoint) ||
        !("x" in endPoint && "y" in endPoint)
      ) {
        continue
      }

      const startRelative = applyToPoint(rotationMatrix, {
        x: startPoint.x - componentCenter.x,
        y: -(startPoint.y - componentCenter.y),
      })
      const endRelative = applyToPoint(rotationMatrix, {
        x: endPoint.x - componentCenter.x,
        y: -(endPoint.y - componentCenter.y),
      })

      if (
        startRelative.x === endRelative.x &&
        startRelative.y === endRelative.y
      ) {
        continue
      }

      const segmentLayerSource =
        ("layer" in startPoint ? startPoint.layer : undefined) ??
        ("layer" in endPoint ? endPoint.layer : undefined) ??
        lastKnownLayer
      const kicadLayer = getKicadLayer(segmentLayerSource)
      const strokeWidth =
        ("width" in startPoint ? startPoint.width : undefined) ??
        ("width" in endPoint ? endPoint.width : undefined) ??
        0.25

      const fpLine = new FpLine({
        start: { x: startRelative.x, y: startRelative.y },
        end: { x: endRelative.x, y: endRelative.y },
        layer: kicadLayer,
        stroke: new Stroke(),
      })
      if (fpLine.stroke) {
        fpLine.stroke.width = strokeWidth
        fpLine.stroke.type = "solid"
      }
      fpLines.push(fpLine)

      if ("layer" in startPoint && startPoint.layer) {
        lastKnownLayer = startPoint.layer
      }
      if ("layer" in endPoint && endPoint.layer) {
        lastKnownLayer = endPoint.layer
      }

      // Geometric fallback when a bridge trace omits start/end pcb_port_id.
      if (touchedPadNumbers.size < 2) {
        const tolerance = strokeWidth / 2 + 0.05
        for (const endpoint of [startRelative, endRelative]) {
          for (const pad of fpPads) {
            if (!pad.number || !pad.at || !pad.size) continue
            const halfW = (pad.size.width ?? 0) / 2 + tolerance
            const halfH = (pad.size.height ?? 0) / 2 + tolerance
            if (
              Math.abs(endpoint.x - pad.at.x) <= halfW &&
              Math.abs(endpoint.y - pad.at.y) <= halfH
            ) {
              touchedPadNumbers.add(pad.number)
            }
          }
        }
      }
    }

    if (touchedPadNumbers.size >= 2) {
      const merged = new Set(touchedPadNumbers)
      for (let gi = padGroups.length - 1; gi >= 0; gi--) {
        const existing = padGroups[gi]!
        let overlaps = false
        for (const padNum of existing) {
          if (merged.has(padNum)) {
            overlaps = true
            break
          }
        }
        if (overlaps) {
          for (const padNum of existing) {
            merged.add(padNum)
          }
          padGroups.splice(gi, 1)
        }
      }
      padGroups.push(merged)
    }
  }

  const netTiePadGroups = padGroups
    .map((group) =>
      Array.from(group)
        .sort((a, b) => {
          const numA = Number(a)
          const numB = Number(b)
          if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
            return numA - numB
          }
          return a.localeCompare(b)
        })
        .join(","),
    )
    .sort((a, b) => a.localeCompare(b))

  return { fpLines, netTiePadGroups }
}
