import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import {
  Pts,
  Xy,
  Zone,
  ZoneHatch,
  ZoneKeepout,
  ZonePolygon,
} from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { ConverterStage } from "../../types"
import { getKicadLayer } from "../utils/layerMapping"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import { circleToPolygon } from "./utils/circleToPolygon"

type PcbKeepout = Extract<CircuitJson[number], { type: "pcb_keepout" }>

const getKeepouts = (circuitJson: CircuitJson): PcbKeepout[] =>
  circuitJson.filter(
    (el): el is PcbKeepout => el.type === "pcb_keepout",
  )

const mapLayers = (layers: string[]): string[] =>
  layers.map(getKicadLayer)

const getRectPoints = (
  keepout: PcbKeepout & { shape: "rect" },
  c2kMatPcb: Matrix,
): Xy[] => {
  const { center, width, height } = keepout
  const halfW = width / 2
  const halfH = height / 2
  return [
    { x: center.x - halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y + halfH },
    { x: center.x - halfW, y: center.y + halfH },
  ].map((pt) => {
    const t = applyToPoint(c2kMatPcb, pt)
    return new Xy(t.x, t.y)
  })
}

const getCirclePoints = (
  keepout: PcbKeepout & { shape: "circle" },
  c2kMatPcb: Matrix,
): Xy[] => {
  return circleToPolygon(keepout.center, keepout.radius).map(([x, y]) => {
    const t = applyToPoint(c2kMatPcb, { x, y })
    return new Xy(t.x, t.y)
  })
}

export class AddKeepoutsStage extends ConverterStage<CircuitJson, KicadPcb> {
  override _step(): void {
    const { kicadPcb, c2kMatPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    if (!c2kMatPcb) {
      throw new Error("PCB transformation matrix not initialized in context")
    }

    const keepouts = getKeepouts(this.input)

    for (const keepout of keepouts) {
      const kicadLayers = mapLayers(keepout.layers)

      let points: Xy[]
      if (keepout.shape === "rect") {
        points = getRectPoints(keepout as PcbKeepout & { shape: "rect" }, c2kMatPcb)
      } else {
        points = getCirclePoints(keepout as PcbKeepout & { shape: "circle" }, c2kMatPcb)
      }

      if (points.length < 3) continue

      const zone = new Zone({
        net: 0,
        netName: "",
        layers: kicadLayers.length > 1 ? kicadLayers : undefined,
        layer: kicadLayers.length === 1 ? kicadLayers[0] : undefined,
        uuid: generateDeterministicUuid(
          `keepout:${keepout.pcb_keepout_id}`,
        ),
        hatch: new ZoneHatch("edge", 0.5),
        keepout: new ZoneKeepout({
          tracks: "not_allowed",
          vias: "not_allowed",
          copperpour: "not_allowed",
          pads: "allowed",
          footprints: "allowed",
        }),
        polygons: [new ZonePolygon(new Pts(points))],
      })

      const zones = kicadPcb.zones
      zones.push(zone)
      kicadPcb.zones = zones
    }

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
