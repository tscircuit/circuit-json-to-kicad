# Repro 31: export an EasyEDA OBJ-only USB-C model to KiCad

## Problem and motivation

`seveibar/smd-usb-c` supplies an OBJ URL from `modelcdn.tscircuit.com`, but no
STEP or WRL URL. KiCad export previously kept the footprint and all pads while
silently omitting the connector body. A board could therefore look complete in
tscircuit and lose mechanical geometry in KiCad.

## Fix

For OBJ URLs recognized as tscircuit EasyEDA model-CDN URLs, the PCB converter
derives the matching `.step` asset URL. Both supported URL forms are handled:

- `/easyeda_models/assets/<part>.obj?uuid=...`
- legacy `/easyeda_models/download?uuid=...&pn=<part>`

The fallback is intentionally restricted to `modelcdn.tscircuit.com`. Arbitrary
OBJ URLs are not relabeled as STEP files. An explicitly supplied STEP model
still has priority, followed by WRL, before this fallback.

The existing model download and project packaging flow then writes the derived
STEP asset under `3dmodels/tscircuit_builtin.3dshapes/`, matching the model path
stored in the generated KiCad PCB.

## Regression test

The test uses a formatting-normalized copy of `seveibar/smd-usb-c` version
0.0.2 (release `a2a7a2e5-1cf5-4a6d-ac90-6ff691e94b1d`). It generates Circuit
JSON through `Circuit` and verifies that the input truly contains an OBJ URL
without STEP, WRL, or a builtin-footprinter fallback.

It then verifies:

- the footprint and all 22 pad/hole entries remain present;
- one KiCad model is emitted;
- `C165948.step` is included in the model download list;
- the PCB refers to its packaged `${KIPRJMOD}` path;
- KiCad loads and renders the actual STEP model.

The compressed STEP fixture is the exact CDN asset used for offline rendering.
Its decompressed SHA-256 is checked before use:
`3806dacd6082a75cfb24d3ba4b86b3d0c96213134c67e1385eb1599a89b2c461`.

## Run

```sh
bun test tests/pcb/repros/repro31-usb-c-obj-only-model.test.tsx
```

The test writes a manually inspectable board and model to
`debug-output/repro31/`. The PNG snapshot is an actual KiCad 3D render,
normalized only for stable image comparison.

## Provenance

- [Component source](https://api.tscircuit.com/package_files/get?package_release_id=a2a7a2e5-1cf5-4a6d-ac90-6ff691e94b1d&file_path=index.tsx)
- [STEP asset](https://modelcdn.tscircuit.com/easyeda_models/assets/C165948.step)
