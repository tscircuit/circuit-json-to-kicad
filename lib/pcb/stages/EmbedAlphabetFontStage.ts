import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { ConverterStage } from "../../types"
import { embedAlphabetFont } from "../../fonts/embedAlphabetFont"

export class EmbedAlphabetFontStage extends ConverterStage<
  CircuitJson,
  KicadPcb
> {
  override _step(): void {
    embedAlphabetFont(this.ctx.kicadPcb!)
    this.finished = true
  }
}
