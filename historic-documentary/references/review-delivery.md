# Documentary review and delivery

Review the film as a complete story and as a technical artifact. Automated checks can find defects; they cannot establish historical accuracy, emotional pacing or broadcast acceptance.

## Review stages

| Stage | Reviewable result | Decision before scaling |
| --- | --- | --- |
| Research outline | Central question, sequence plan and consequential claims | Evidence supports the story and scope |
| Style sample | Map motion, archive/document treatment and voice audition | Readability, movement, geography, voice and pacing work together |
| Complete animatic | Full story with provisional picture and sound | Structure and conclusion work within the duration |
| Viewing copy | Complete film with finished map masters and approved audio | Timecoded editorial corrections |
| Release candidate | Final picture, sound, captions, credits and rights records | Intended use and delivery checks are complete |

These are decision points, not mandatory repeated permission requests. Existing authorization and accepted choices carry forward. Reopen a decision when new evidence, cost or a substantial scope change requires it.

## Historical and editorial pass

- Trace important dates, numbers, quotations and causal claims to their exact evidence. Check names, ranks, organizational changes and source dates.
- Verify that map positions, routes and arrows match the stated confidence. Confirm period geography and vertical scale.
- Check that archival images depict what captions claim. Contextual material must not acquire a false identity through narration or cutting.
- Watch without pausing. Does the opening establish the question? Can a viewer follow the chronology and geography? Does each change of scale have a bridge? Does the conclusion answer the question?
- Check repeated visuals, excessive titles, rushed inserts and long static passages. Let the content determine the hold, not a uniform duration for every shot.
- Review sensitive material with restraint. Ensure casualty categories and graphics communicate the supported measure.

## Visual pass

Inspect the actual encoded film at intended viewing size, including first and last frames of changed shots and several points during each move. Check mirrored text, off-screen labels, tree/marker overlaps, title contrast, superscripts, focus and cropping. Test all label states, not just representative stills.

Play arrows and camera movement at normal speed. Check consistent perceived pace, endpoint clearance, ghost trails, duplicate arrows, jitter and temporal shimmer. Check map-to-map transitions for continuity of position and scale. Examine both sides of a dissolve after changing either adjacent shot.

Check photographs and documents for unnecessary upscaling, clipping, distorted proportions and too much movement. The source text should be legible for its intended use. Long archival passages may need an excerpt or narration rather than an unreadable page.

## Audio and caption pass

Listen on headphones and ordinary speakers. Check every difficult name against the pronunciation register; verify natural rhythm, intelligibility, narration joins and musical transitions. Do not assume a generation request produced the intended pronunciation.

Measure loudness and true peak against the selected delivery target. Check for clipping, clicks, accidental silence, stereo problems and voice obscured by music. Preserve separate stems and a lossless mix. When picture alone changes, avoid regenerating the narration or repeatedly transcoding the mix.

Check captions against the final audio, including spelling, punctuation, timing, overlaps and the final cue. Distinguish dialogue captions from contextual archive labels and full credits. Optional caption tracks should remain selectable where the viewing format supports them.

## Technical pass

Record file hashes, duration, frame rate, dimensions, pixel format, colour metadata, audio format and subtitle streams. Verify the complete decode, expected frame count, timestamp continuity and the intended end state. Check media probes for unexpected variable-frame-rate behaviour or truncated streams.

```bash
ffprobe -v error -show_format -show_streams -of json exports/review-v001.mp4
ffmpeg -v error -xerror -err_detect explode -i exports/review-v001.mp4 \
  -map 0:v:0 -map '0:a?' -f null -
```

A decode check establishes that the streams can be read, not that their content is correct. Use encoded contact sheets for systematic inspection and watch the affected sequences in motion. When appropriate, compare unchanged audio/subtitle hashes or decoded samples with the previous accepted export. [FFmpeg command documentation](https://ffmpeg.org/ffmpeg.html)

## Release and delivery

Confirm rights and attribution for every used asset, including music, fonts, maps, data, synthetic narration and archival previews. Keep licence evidence with the project and required credits in the film or accompanying material as specified by the source. Resolve any preview-only asset before public release.

Obtain the named broadcaster's or platform's current specification before making its delivery master. Record required raster, frame rate and scan mode, codec/container, colour, audio layout, loudness/peak limits, captions, metadata, slate/timecode and any required photosensitive-epilepsy or other certification. Do not equate a 1080p viewing MP4 with a television delivery master.

Keep a short delivery note listing the checks actually performed, the file hash and any unresolved limitation. Do not claim an unperformed human watch-through or specialist certification. Preserve the previous accepted version and provide a full film for review, not only disconnected samples.

## Handoff and further editing

Deliver the viewing copy, editable timeline, approved script, captions, scene files and scripts, manifests, source and asset registers, lossless audio/stems, environment record and recovery note. Keep large source assets in their backed-up storage and document how the project resolves them.

Record revisions in `production/review-log.csv`: timecode, observed problem, intended change, affected assets, status and verification. For each requested change, identify the smallest layer or clip that must be rebuilt. Change the full render only when the underlying camera, terrain or other shared 3D dependency actually requires it.
