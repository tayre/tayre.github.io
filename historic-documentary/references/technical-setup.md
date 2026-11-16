# Documentary technical setup

Use the smallest toolchain that supports the agreed film. The framework is editor-neutral: an NLE may own the timeline, or a scripted compositor may do so. Keep one authoritative timeline and an exportable interchange or manifest; avoid several competing versions of the edit.

## Tools and environment

| Tool | Role | Setup decision |
| --- | --- | --- |
| Blender | Terrain, lighting, camera animation and render passes | Use a supported version and record its exact build; test the chosen render device |
| FFmpeg and ffprobe | Media inspection, proxies, composition, encoding and technical checks | Record the build and enabled codecs and filters |
| Python 3.10 or later | Project helpers and reproducible processing | Use a project environment for additional packages |
| An NLE or scripted compositor | Editorial timing, sound, titles and assembly | Select one authoritative edit and save a portable timeline description |
| Audio editor or DAW | Voice cleanup, music edits, stems and mixing | Retain lossless source takes and mixes |
| GIS tools when needed | Georeferencing, projection, terrain and historical-map alignment | Record source data, coordinate systems and processing steps |
| Narration service when needed | Licensed voice generation | Verify current terms, price, capabilities and authorization before use |

Blender plugins are optional. Add one only when it solves a demonstrated need. Record its source, licence, version and compatibility; test it in an isolated scene before making the film depend on it. Do not install or upgrade the whole stack during an active export.

The helper scripts use only Python's standard library. For compositing that needs third-party packages, create an environment and install only the packages actually used. Record a tested package lock or `pip freeze` output afterward; do not treat an untested list of current versions as reproducible. Python environments should be recreated from their recorded dependencies, not moved between machines. [Python venv documentation](https://docs.python.org/3/library/venv.html)

```bash
cd ../documentary-project
python3 -m venv .venv
python3 framework/scripts/preflight.py . --require blender ffmpeg ffprobe
```

The preflight command reads the brief and reports versions, CPU count and free space. If Blender is outside `PATH`, supply `--blender /path/to/blender`. It does not install, render or alter media. Save the report inside `production/` when useful with `--output production/environment.json`.

## Project layout

```text
project/
  AGENTS.md
  framework/                 Snapshot of this playbook and helpers
  production/                Brief, decisions, recovery and review log
  research/                  Claims, source register and working transcripts
  assets/
    originals/               Untouched archival media and source documents
    derivatives/             Crops, proxies, masks and normalized clips
    register.csv             Provenance, rights and editorial role
  audio/
    narration/               Submitted text, original takes and selected edits
    music/                   Licensed sources and cue edits
    stems/                   Separate voice, music and ambience
    pronunciations.csv
  blender/
    scenes/                  Versioned blend files
    scripts/                 Scene generation and data import code
    data/                    Geographic data and movement definitions
  edit/                      Authoritative timeline, captions and graphics
  renders/                   Restartable frames and passes
  masters/                   Verified reusable scene masters
  exports/                   Versioned viewing and delivery copies
  qc/                        Measurements, proofs and review findings
  checkpoints/               Content-addressed editable-file snapshots
```

Keep these production folders outside the framework repository. Use project-relative paths in scripts and manifests. Resolve machine-specific tool paths through configuration. Save credentials outside source control; do not include account cookies, signed download links or payment records in public registers.

## Render architecture

Separate work into data, scene construction, rendering, graphic composition, editorial assembly and verification. A renderer should consume a saved scene and manifest; it should not make editorial decisions or download sources during a frame batch.

Use the following independently editable components:

- A clean terrain and environment pass with no animated units, arrows or labels.
- Camera matrices and geographic-to-scene transforms for each frame.
- Unit markers, routes and arrows as separate passes or projected overlays.
- Text, dates, captions, credits and document treatments composed after the 3D pass where practical.
- Depth and other auxiliary passes only when required by the treatment.
- Audio and captions independent of rendered pictures.

This allows a label correction, shorter arrow or title change to recompose the affected shot. If elements must cast real shadows, keep their contribution separable or retain an exactly matching clean plate. Do not reconstruct the underlying map from a differently lit frame.

Drive animation from continuous time or native frame samples. Keep frame rate as a rational numerator and denominator, and durations as integer frames. Define source in/out ranges as start-inclusive and end-exclusive in the timeline; convert explicitly for tools that use inclusive end frames. Do not independently round each scene's seconds and accumulate drift.

Use a consistent colour-management plan. Record the Blender view transform, working colour space, conversion and output tags. Convert pixel values when needed; changing tags alone is not a colour transform. Avoid applying a display transform twice to maps or mixing unconverted archive material with them.

Treat camera, terrain, lighting, labels, routes, source assets and code as separate dependency groups. A cache entry is valid only for its recorded inputs and settings. Include hashes, tool versions, render settings and expected frame count in the manifest. Do not reuse an output solely because its filename exists.

## Benchmark and render

Test the hardest representative scene: dense vegetation, largest map extent, depth of field, atmospheric effects and final label placement. Measure warm render time and peak resource use at intended settings. Estimate remaining cost from comparable frames, with a range for uncertainty and explicit allowance for composition, encoding and checks.

On a constrained machine, start with one Blender process and limited threads. Raise concurrency only after measuring memory and disk behaviour. Independent short CPU compositions may run concurrently when they have separate output paths and sufficient resources. Do not duplicate an active job after a session disconnect.

Render a motion sample as well as still proofs. Temporally unstable denoising, frame interpolation or depth of field can look acceptable in a single image. Check actual playback for shimmer, stutter, abrupt camera acceleration and unreadable labels.

Use versioned image sequences or suitable intermediate masters. Set render bounds explicitly. This example is a bounded 50-frame batch, not a full-film render:

```bash
blender -b blender/scenes/scene-v001.blend -t 2 \
  -s 1 -e 50 -o //../../renders/scene-v001/frame_##### -F PNG -a
```

Blender executes arguments in order; load the scene before overrides and put the render action last. Check its current command-line documentation for the installed version. [Blender command-line rendering](https://docs.blender.org/manual/en/latest/advanced/command_line/render.html)

Save frames atomically where possible. Write movies to a temporary filename, verify them, then rename to the final asset name. Keep per-shot frame counts, hashes and completion status. A successful encoder exit is necessary but not a substitute for checking the encoded result.

Include transition handles in scene masters. For an overlapping dissolve, account for the overlap once in the timeline; do not silently change programme duration. When a neighbouring shot changes, regenerate the short transition sections that depend on it.

## Resource and recovery controls

Set a protected disk reserve and a maximum permitted job duration in the brief. Account for temporary frames, intermediate movies, final output and checkpoint overhead before starting. Pause between batches if there is insufficient headroom. Clean only reproducible caches whose verified masters and required passes are retained. Never remove originals, sole copies of scenes or an active job's input frames to gain space.

Use the checkpoint helper before substantial edits, at export milestones and before handoff:

```bash
python3 framework/scripts/checkpoint.py . save --label before-map-revision
python3 framework/scripts/checkpoint.py . verify
```

It copies supported editable files from the production directories into a deduplicated object store and inventories large media in place. Set `authoritative_timeline` in the brief to the actual editor project or interchange file. That path is copied regardless of extension. Use `checkpoint.additional_editable_paths` for other native project files or bundles; save the editor's work first. Missing explicitly selected files cause an error rather than a misleading complete checkpoint. The manifest states what is recoverable.

This is a local recovery mechanism, not a separate-device backup of the film. Keep the original media and verified masters backed up independently. To restore, verify first and copy the recorded objects into a new directory according to the manifest; compare before replacing working files.

Keep `production/RECOVERY.md` current with the latest verified film, active job/session identifiers, log locations, input scene hashes, completed and missing clips, next command, resource limits and known blockers. After a crash, inspect that note, live processes, output manifests and disk space before resuming the first incomplete unit of work.

An HTML or terminal progress report should read the same manifests. Distinguish map rendering from the overall film. Show completed/total frames or shots, stage, last checkpoint, free disk and a timestamped usage balance. Show a saved frame or representative encoded output when available. Estimate completion from recent measured throughput; mark stale processes or unknown stages rather than showing a false percentage.

## Assembly and revisions

Make scene masters once, then revise through an editable timeline. Keep each expensive map shot separate from titles and archive inserts. Encode a new short segment only when its pixels change. Retain matching codec, dimensions, frame rate, time base and colour properties if concatenating compatible segments without re-encoding. Preserve the previous full export until the new copy passes checks.

FFmpeg provides stream selection, stream copying, transcoding and filters for media workflows. Filtered pictures need an encode; stream copy is useful only where the existing streams and boundaries permit it. Refer to its current documentation rather than assuming every build contains the same filters. [FFmpeg documentation](https://ffmpeg.org/ffmpeg.html) · [Filter reference](https://ffmpeg.org/ffmpeg-filters.html)

Avoid an ever-growing chain of scripts that import and mutate previous editions. Keep one maintained composition engine, immutable input manifests and a small explicit revision record. Test a change on the affected short excerpt, then assemble the full viewing copy. A new long render during editing needs a clear scope, estimate and authorization appropriate to the user's stated limits.
