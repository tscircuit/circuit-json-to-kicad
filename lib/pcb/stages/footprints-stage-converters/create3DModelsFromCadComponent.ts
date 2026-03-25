import type { CadComponent } from "circuit-json"
import { FootprintModel } from "kicadts"

export function create3DModelsFromCadComponent(
  cadComponent: CadComponent,
  componentCenter: { x: number; y: number },
  options?: { boardLayerZOffset?: number },
): FootprintModel[] {
  const models: FootprintModel[] = []

  const modelUrl = cadComponent.model_step_url || cadComponent.model_wrl_url
  if (!modelUrl) return models

  const model = new FootprintModel(modelUrl)

  if (cadComponent.position) {
    // circuit-json position.z includes boardThickness/2 to place the component
    // at the PCB surface in tscircuit's coordinate system (PCB center = z=0).
    // KiCad model offsets are relative to the PCB surface, so we subtract
    // the layer z offset (boardThickness/2 for top, -boardThickness/2 for bottom).
    // NOTE: unlike 2D footprint geometry, KiCad 3D model Y offsets map directly
    // from circuit-json local footprint Y. Do not mirror Y here.
    const boardLayerZOffset = options?.boardLayerZOffset ?? 0
    model.offset = {
      x: (cadComponent.position.x || 0) - componentCenter.x,
      y: (cadComponent.position.y || 0) - componentCenter.y,
      z: (cadComponent.position.z || 0) - boardLayerZOffset,
    }
  }

  if (cadComponent.rotation) {
    model.rotate = {
      x: cadComponent.rotation.x || 0,
      y: cadComponent.rotation.y || 0,
      z: cadComponent.rotation.z || 0,
    }
  }

  if (cadComponent.model_unit_to_mm_scale_factor) {
    const scale = cadComponent.model_unit_to_mm_scale_factor
    model.scale = { x: scale, y: scale, z: scale }
  }

  models.push(model)
  return models
}
