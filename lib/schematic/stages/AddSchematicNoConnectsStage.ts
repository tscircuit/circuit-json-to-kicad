import type { CircuitJson } from "circuit-json"
import { NoConnect, type KicadSch } from "kicadts"
import { ConverterStage } from "../../types"
import { transformSchematicPoint } from "./utils/schematicCoordinates"

/** Adds KiCad no-connect markers for source ports intentionally left open. */
export class AddSchematicNoConnectsStage extends ConverterStage<
  CircuitJson,
  KicadSch
> {
  override _step(): void {
    const { db, kicadSch, c2kMatSch } = this.ctx

    if (!kicadSch) {
      throw new Error("KicadSch instance not initialized in context")
    }
    if (!c2kMatSch) {
      throw new Error(
        "Schematic transformation matrix not initialized in context",
      )
    }

    const noConnectSourcePortIds = new Set(
      db.source_port
        .list()
        .filter((sourcePort) => sourcePort.do_not_connect)
        .map((sourcePort) => sourcePort.source_port_id),
    )

    const noConnects = db.schematic_port
      .list()
      .filter(
        (schematicPort) =>
          noConnectSourcePortIds.has(schematicPort.source_port_id) &&
          !schematicPort.is_connected,
      )
      .map((schematicPort) => {
        const position = transformSchematicPoint(
          c2kMatSch,
          schematicPort.center,
        )
        return new NoConnect({
          at: [position.x, position.y],
          uuid: crypto.randomUUID(),
        })
      })

    kicadSch.noConnects = [...kicadSch.noConnects, ...noConnects]
    this.finished = true
  }
}
