import type { CadComponent } from "circuit-json"
import { FootprintModel } from "kicadts"

const getEasyedaModelCdnStepUrl = (objUrl?: string): string | undefined => {
  if (!objUrl) return undefined

  try {
    const url = new URL(objUrl)
    if (url.hostname !== "modelcdn.tscircuit.com") return undefined

    const assetMatch = url.pathname.match(
      /^\/easyeda_models\/assets\/([^/]+)\.obj$/,
    )
    const partNumber = assetMatch?.[1] ?? url.searchParams.get("pn")
    const isLegacyDownload = url.pathname === "/easyeda_models/download"
    if (!partNumber || (!assetMatch && !isLegacyDownload)) return undefined

    const stepUrl = new URL(
      `/easyeda_models/assets/${encodeURIComponent(partNumber)}.step`,
      url.origin,
    )
    const uuid = url.searchParams.get("uuid")
    if (uuid) stepUrl.searchParams.set("uuid", uuid)
    return stepUrl.toString()
  } catch {
    return undefined
  }
}

export function create3DModelsFromCadComponent(
  cadComponent: CadComponent,
  componentCenter: { x: number; y: number },
  options?: { boardLayerZOffset?: number; footprintRotation?: number },
): FootprintModel[] {
  const models: FootprintModel[] = []

  const modelUrl =
    cadComponent.model_step_url ||
    cadComponent.model_wrl_url ||
    getEasyedaModelCdnStepUrl(cadComponent.model_obj_url)
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
    const modelOriginPosition = cadComponent.model_origin_position
    model.offset = {
      x:
        (cadComponent.position.x || 0) -
        componentCenter.x -
        (modelOriginPosition?.x || 0),
      y:
        (cadComponent.position.y || 0) -
        componentCenter.y -
        (modelOriginPosition?.y || 0),
      z:
        (cadComponent.position.z || 0) -
        boardLayerZOffset -
        (modelOriginPosition?.z || 0),
    }
  }

  if (cadComponent.rotation) {
    const footprintRotation = options?.footprintRotation ?? 0

    model.rotate = {
      x: cadComponent.rotation.x || 0,
      y: cadComponent.rotation.y || 0,
      z: (cadComponent.rotation.z || 0) - footprintRotation,
    }
  }

  if (cadComponent.model_unit_to_mm_scale_factor) {
    const scale = cadComponent.model_unit_to_mm_scale_factor
    model.scale = { x: scale, y: scale, z: scale }
  }

  models.push(model)
  return models
}
