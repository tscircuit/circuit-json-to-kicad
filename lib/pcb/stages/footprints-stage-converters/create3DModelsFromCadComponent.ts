import type { CadComponent } from "circuit-json"
import { FootprintModel } from "kicadts"

export function create3DModelsFromCadComponent(
  cadComponent: CadComponent,
  componentCenter: { x: number; y: number },
): FootprintModel[] {
  const models: FootprintModel[] = []

  const modelUrl = cadComponent.model_step_url || cadComponent.model_wrl_url
  if (!modelUrl) return models

  const model = new FootprintModel(modelUrl)

  if (cadComponent.position) {
    model.offset = {
      x: (cadComponent.position.x || 0) - componentCenter.x,
      y: -((cadComponent.position.y || 0) - componentCenter.y),
      z: cadComponent.position.z || 0,
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
