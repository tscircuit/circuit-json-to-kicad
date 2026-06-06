import type { CircuitJson, PCBKeepout, PCBKeepoutRect } from "circuit-json"
import type { KicadPcb } from "kicadts"
import {
  Pts,
  Xy,
  Zone,
  ZoneConnectPads,
  ZoneHatch,
  ZoneKeepout,
  ZonePolygon,
} from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { ConverterStage, type ConverterContext } from "../../types"
import { getKicadLayer } from "../utils/layerMapping"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"

const getRectKeepoutPolygonPoints = (
  keepout: PCBKeepoutRect,
  c2kMatPcb: Matrix,
): Xy[] => {
  const halfWidth = keepout.width / 2
  const halfHeight = keepout.height / 2

  return [
    {
      x: keepout.center.x - halfWidth,
      y: keepout.center.y - halfHeight,
    },
    {
      x: keepout.center.x + halfWidth,
      y: keepout.center.y - halfHeight,
    },
    {
      x: keepout.center.x + halfWidth,
      y: keepout.center.y + halfHeight,
    },
    {
      x: keepout.center.x - halfWidth,
      y: keepout.center.y + halfHeight,
    },
  ].map((point) => {
    const transformedPoint = applyToPoint(c2kMatPcb, point)
    return new Xy(transformedPoint.x, transformedPoint.y)
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

    const keepouts = this.ctx.db.pcb_keepout?.list() as PCBKeepout[] | undefined

    for (const keepout of keepouts ?? []) {
      if (keepout.shape !== "rect") continue

      const polygonPoints = getRectKeepoutPolygonPoints(keepout, c2kMatPcb)

      let kicadLayers = ["F.Cu"]
      if (keepout.layers.length > 0) {
        kicadLayers = keepout.layers.map(getKicadLayer)
      }

      let layer: string | undefined
      let layers: string[] | undefined
      if (kicadLayers.length === 1) {
        layer = kicadLayers[0]
      }
      if (kicadLayers.length > 1) {
        layers = kicadLayers
      }

      const zone = new Zone({
        net: 0,
        netName: "",
        layer,
        layers,
        uuid: generateDeterministicUuid(
          `keepout:${keepout.pcb_keepout_id ?? ""}`,
        ),
        name: keepout.description,
        hatch: new ZoneHatch("edge", 0.5),
        connectPads: new ZoneConnectPads({ enabled: true, clearance: 0.15 }),
        minThickness: 0.25,
        keepout: new ZoneKeepout({
          tracks: "not_allowed",
          vias: "not_allowed",
          pads: "not_allowed",
          copperpour: "not_allowed",
          footprints: "not_allowed",
        }),
        fill: undefined,
        polygons: [new ZonePolygon(new Pts(polygonPoints))],
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
