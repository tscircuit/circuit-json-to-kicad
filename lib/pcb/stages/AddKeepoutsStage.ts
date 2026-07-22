import type { CircuitJson, PCBKeepout } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Pts, Xy, Zone, ZoneKeepout, ZonePolygon } from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { ConverterStage } from "../../types"
import { getKicadLayer } from "../utils/layerMapping"
import { circleToPolygon } from "./utils/circleToPolygon"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"

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
      const kicadLayers = keepout.layers.map(getKicadLayer)

      let rawPoints: { x: number; y: number }[]
      if (keepout.shape === "rect") {
        const halfW = keepout.width / 2
        const halfH = keepout.height / 2
        rawPoints = [
          { x: keepout.center.x - halfW, y: keepout.center.y - halfH },
          { x: keepout.center.x + halfW, y: keepout.center.y - halfH },
          { x: keepout.center.x + halfW, y: keepout.center.y + halfH },
          { x: keepout.center.x - halfW, y: keepout.center.y + halfH },
        ]
      } else {
        rawPoints = circleToPolygon(keepout.center, keepout.radius).map(
          ([x, y]) => ({ x, y }),
        )
      }

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
