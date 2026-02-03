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
    general.thickness = 1.6 // Standard PCB thickness in mm
    kicadPcb.general = general

    // Add setup section with basic design rules
    const setup = new Setup()
    setup.padToMaskClearance = 0.0
    kicadPcb.setup = setup

    // Initialize PCB layers based on number of copper layers
    // KiCad layer indices:
    // - F.Cu = 0, B.Cu = 31 (for 2-layer) or inner positions
    // - Inner layers use indices 1-30
    // Standard convention for 4-layer: F.Cu(0), In1.Cu(1), In2.Cu(2), B.Cu(31)
    const layers = new PcbLayers()

    const layerDefinitions: PcbLayerDefinition[] = [
      // Front copper layer
      new PcbLayerDefinition({ index: 0, name: "F.Cu", type: "signal" }),
    ]

    // Add inner copper layers for boards with more than 2 layers
    // Inner layers use sequential indices starting from 1
    for (let i = 1; i < numLayers - 1; i++) {
      layerDefinitions.push(
        new PcbLayerDefinition({ index: i, name: `In${i}.Cu`, type: "signal" }),
      )
    }

    // Back copper layer - index 31 in KiCad for standard boards
    layerDefinitions.push(
      new PcbLayerDefinition({ index: 31, name: "B.Cu", type: "signal" }),
    )

    // Technical layers (standard KiCad indices)
    layerDefinitions.push(
      new PcbLayerDefinition({ index: 32, name: "B.Adhes", type: "user" }),
      new PcbLayerDefinition({ index: 33, name: "F.Adhes", type: "user" }),
      new PcbLayerDefinition({ index: 34, name: "B.Paste", type: "user" }),
      new PcbLayerDefinition({ index: 35, name: "F.Paste", type: "user" }),
      new PcbLayerDefinition({ index: 36, name: "B.SilkS", type: "user" }),
      new PcbLayerDefinition({ index: 37, name: "F.SilkS", type: "user" }),
      new PcbLayerDefinition({ index: 38, name: "B.Mask", type: "user" }),
      new PcbLayerDefinition({ index: 39, name: "F.Mask", type: "user" }),
      // Drawing layers
      new PcbLayerDefinition({ index: 40, name: "Dwgs.User", type: "user" }),
      new PcbLayerDefinition({ index: 41, name: "Cmts.User", type: "user" }),
      new PcbLayerDefinition({ index: 42, name: "Eco1.User", type: "user" }),
      new PcbLayerDefinition({ index: 43, name: "Eco2.User", type: "user" }),
      new PcbLayerDefinition({ index: 44, name: "Edge.Cuts", type: "user" }),
      new PcbLayerDefinition({ index: 45, name: "Margin", type: "user" }),
      // Fabrication layers
      new PcbLayerDefinition({ index: 46, name: "B.CrtYd", type: "user" }),
      new PcbLayerDefinition({ index: 47, name: "F.CrtYd", type: "user" }),
      new PcbLayerDefinition({ index: 48, name: "B.Fab", type: "user" }),
      new PcbLayerDefinition({ index: 49, name: "F.Fab", type: "user" }),
    )

    layers.definitions = layerDefinitions
    kicadPcb.layers = layers

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
