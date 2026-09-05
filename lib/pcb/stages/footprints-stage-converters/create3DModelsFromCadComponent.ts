import type { CadComponent } from "circuit-json"
import { FootprintModel } from "kicadts"
import { getKicadFootprintLocalModelTransform } from "./getKicadFootprintLocalModelTransform"

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
  options: {
    boardSurfaceZ: number
    footprintRotation: number
    footprintSide: "top" | "bottom"
  },
): FootprintModel[] {
  const models: FootprintModel[] = []

  const modelUrl =
    cadComponent.model_step_url ||
    cadComponent.model_wrl_url ||
    getEasyedaModelCdnStepUrl(cadComponent.model_obj_url)
  if (!modelUrl) return models

  const model = new FootprintModel(modelUrl)

  const transform = getKicadFootprintLocalModelTransform(cadComponent, {
    componentCenter,
    footprintRotation: options.footprintRotation,
    boardSurfaceZ: options.boardSurfaceZ,
    footprintSide: options.footprintSide,
  })
  model.offset = transform.offset
  model.rotate = transform.rotation

  if (cadComponent.model_unit_to_mm_scale_factor) {
    const scale = cadComponent.model_unit_to_mm_scale_factor
    model.scale = { x: scale, y: scale, z: scale }
  }

  models.push(model)
  return models
}
