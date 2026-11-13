import type { CircuitJson, PCBKeepout } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Pts, Xy, Zone, ZoneKeepout, ZonePolygon } from "kicadts"
import { applyToPoint, rotate } from "transformation-matrix"
import { ConverterStage } from "../../types"
import { getKicadLayer } from "../utils/layerMapping"
import { circleToPolygon } from "./utils/circleToPolygon"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import { getRectanglePoints } from "./utils/getRectanglePoints"

const isPcbKeepout = (element: CircuitJson[number]): element is PCBKeepout =>
  element.type === "pcb_keepout"

const getKeepouts = (circuitJson: CircuitJson): PCBKeepout[] =>
  circuitJson.filter(isPcbKeepout)

export class AddKeepoutsStage extends ConverterStage<CircuitJson, KicadPcb> {
  override _step(): void {
    const { kicadPcb, c2kMatPcb } = this.ctx

    if (!kicadPcb)
      throw new Error("KicadPcb instance not initialized in context")
    if (!c2kMatPcb)
      throw new Error("PCB transformation matrix not initialized in context")

    const keepouts = getKeepouts(this.input)

    for (const keepout of keepouts) {
      const rawLayers =
        Array.isArray(keepout.layers) && keepout.layers.length > 0
          ? keepout.layers
          : "layer" in keepout &&
              typeof (keepout as { layer?: unknown }).layer === "string"
            ? [(keepout as unknown as { layer: string }).layer]
            : ["top", "bottom"]
      const kicadLayers = rawLayers.map(getKicadLayer)

      let rawPoints: { x: number; y: number }[] | undefined
      if (keepout.shape === "rect") {
        const rectKeepout = keepout as PCBKeepout & {
          ccw_rotation?: number
          rotation?: number
          corner_radius?: number
          border_radius?: number
          rect_border_radius?: number
        }
        const rotationDegrees =
          rectKeepout.ccw_rotation ?? rectKeepout.rotation ?? 0
        const cornerRadius =
          rectKeepout.corner_radius ??
          rectKeepout.border_radius ??
          rectKeepout.rect_border_radius ??
          0
        const rotMatrix = rotationDegrees
          ? rotate((rotationDegrees * Math.PI) / 180)
          : undefined
        rawPoints = getRectanglePoints({
          width: keepout.width,
          height: keepout.height,
          corner_radius: cornerRadius,
        }).map((pt) => {
          const rotated = rotMatrix ? applyToPoint(rotMatrix, pt) : pt
          return {
            x: keepout.center.x + rotated.x,
            y: keepout.center.y + rotated.y,
          }
        })
      } else if (keepout.shape === "circle") {
        rawPoints = circleToPolygon(keepout.center, keepout.radius).map(
          ([x, y]) => ({ x, y }),
        )
      } else {
        const polyKeepout = keepout as PCBKeepout & {
          outline?: { x: number; y: number }[]
          points?: { x: number; y: number }[]
        }
        rawPoints = polyKeepout.outline ?? polyKeepout.points
      }

      if (!Array.isArray(rawPoints) || rawPoints.length < 3) continue

      const kicadPoints = rawPoints.map((p) => {
        const t = applyToPoint(c2kMatPcb, p)
        return new Xy(t.x, t.y)
      })

      const zone = new Zone({
        net: 0,
        netName: "",
        layers: kicadLayers,
        uuid: generateDeterministicUuid(`keepout:${keepout.pcb_keepout_id}`),
        keepout: new ZoneKeepout({
          tracks: "not_allowed",
          vias: "not_allowed",
          pads: "not_allowed",
          copperpour: "not_allowed",
          footprints: "not_allowed",
        }),
        polygons: [new ZonePolygon(new Pts(kicadPoints))],
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
