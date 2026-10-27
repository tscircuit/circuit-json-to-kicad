import type { PcbBoard } from "circuit-json"
import { ViaTenting } from "kicadts"

type ViaTentingInput = {
  tented_on_top?: boolean
  tented_on_bottom?: boolean
  /** @deprecated in Circuit JSON; applies to any side not set explicitly */
  is_tented?: boolean
}

type KicadTentingValue = "yes" | "no" | "none"

const toKicadTentingValue = (tented: boolean | undefined): KicadTentingValue =>
  tented === undefined ? "none" : tented ? "yes" : "no"

/**
 * Per-via tenting in the KiCad 9+ format:
 * `(tenting (front yes|no|none) (back yes|no|none))`.
 *
 * kicadts' ViaTenting only serializes the legacy bare-side form
 * (`(tenting front back)`), which KiCad 9/10 ignore for vias, so the
 * serialization is overridden here. `none` means "follow the board default".
 */
export class KicadViaTenting extends ViaTenting {
  constructor(
    public front: KicadTentingValue,
    public back: KicadTentingValue,
  ) {
    super()
  }

  override getString(): string {
    return `(tenting (front ${this.front}) (back ${this.back}))`
  }
}

/**
 * Maps Circuit JSON via tenting to a KiCad via tenting node.
 *
 * - `tented_on_top` -> front, `tented_on_bottom` -> back
 * - deprecated `is_tented` fills any side not set explicitly (the same
 *   precedence circuit-json's own pcb_via transform uses)
 * - the owning PCB’s defaults fill any side still unset
 * - no tenting information at all -> undefined, so no token is emitted and
 *   KiCad keeps using the board default
 */
export const createViaTenting = (
  via: ViaTentingInput,
  board?: PcbBoard,
): KicadViaTenting | undefined => {
  const top =
    via.tented_on_top ?? via.is_tented ?? board?.default_via_tented_on_top
  const bottom =
    via.tented_on_bottom ?? via.is_tented ?? board?.default_via_tented_on_bottom

  if (top === undefined && bottom === undefined) return undefined

  return new KicadViaTenting(
    toKicadTentingValue(top),
    toKicadTentingValue(bottom),
  )
}
