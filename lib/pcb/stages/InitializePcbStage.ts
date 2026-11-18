import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import {
  Paper,
  PcbLayers,
  PcbLayerDefinition,
  PcbGeneral,
  Setup,
} from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"

/**
 * Initializes the basic KicadPcb structure with version, paper size, layers, UUID, etc.
 */
export class InitializePcbStage extends ConverterStage<CircuitJson, KicadPcb> {
  override _step(): void {
    const { kicadPcb, db } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    // Get the number of layers from the board
    const pcbBoard = db.pcb_board?.list()?.[0]
    const numLayers = pcbBoard?.num_layers ?? 2

    // Store num_layers in context for other stages
    this.ctx.numLayers = numLayers

    // Set the version to KiCad 9.0 format
    kicadPcb.version = 20241229

    // Set paper size to A4 (standard)
    const paper = new Paper()
    paper.size = "A4"
    kicadPcb.paper = paper

    // Add general section with board thickness
    const general = new PcbGeneral()
    general.thickness = pcbBoard?.thickness ?? 1.6 // Standard fallback in mm
    kicadPcb.general = general

    // Add setup section with basic design rules
    const setup = new Setup()
    setup.padToMaskClearance = 0.0
    kicadPcb.setup = setup

    // Initialize PCB layers based on number of copper layers
    // KiCad 9 layer ordinals (include/layer_ids.h), matching the
    // (version 20241229) stamp: copper layers are even (F.Cu 0, B.Cu 2,
    // In1.Cu 4, In2.Cu 6, ...) and technical layers are odd.
    const layers = new PcbLayers()

    const layerDefinitions: PcbLayerDefinition[] = [
      // Front copper layer
      new PcbLayerDefinition({ index: 0, name: "F.Cu", type: "signal" }),
    ]

    // Add inner copper layers for boards with more than 2 layers
    for (let i = 1; i < numLayers - 1; i++) {
      layerDefinitions.push(
        new PcbLayerDefinition({
          index: 2 * i + 2,
          name: `In${i}.Cu`,
          type: "signal",
        }),
      )
    }

    // Back copper layer
    layerDefinitions.push(
      new PcbLayerDefinition({ index: 2, name: "B.Cu", type: "signal" }),
    )

    // Technical layers
    layerDefinitions.push(
      new PcbLayerDefinition({ index: 11, name: "B.Adhes", type: "user" }),
      new PcbLayerDefinition({ index: 9, name: "F.Adhes", type: "user" }),
      new PcbLayerDefinition({ index: 15, name: "B.Paste", type: "user" }),
      new PcbLayerDefinition({ index: 13, name: "F.Paste", type: "user" }),
      new PcbLayerDefinition({ index: 7, name: "B.SilkS", type: "user" }),
      new PcbLayerDefinition({ index: 5, name: "F.SilkS", type: "user" }),
      new PcbLayerDefinition({ index: 3, name: "B.Mask", type: "user" }),
      new PcbLayerDefinition({ index: 1, name: "F.Mask", type: "user" }),
      // Drawing layers
      new PcbLayerDefinition({ index: 17, name: "Dwgs.User", type: "user" }),
      new PcbLayerDefinition({ index: 19, name: "Cmts.User", type: "user" }),
      new PcbLayerDefinition({ index: 21, name: "Eco1.User", type: "user" }),
      new PcbLayerDefinition({ index: 23, name: "Eco2.User", type: "user" }),
      new PcbLayerDefinition({ index: 25, name: "Edge.Cuts", type: "user" }),
      new PcbLayerDefinition({ index: 27, name: "Margin", type: "user" }),
      // Fabrication layers
      new PcbLayerDefinition({ index: 29, name: "B.CrtYd", type: "user" }),
      new PcbLayerDefinition({ index: 31, name: "F.CrtYd", type: "user" }),
      new PcbLayerDefinition({ index: 33, name: "B.Fab", type: "user" }),
      new PcbLayerDefinition({ index: 35, name: "F.Fab", type: "user" }),
    )

    layers.definitions = layerDefinitions
    kicadPcb.layers = layers

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
