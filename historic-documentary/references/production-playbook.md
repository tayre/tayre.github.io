# Historical documentary production playbook

Build the film around a question that evidence can answer. Each sequence should advance the viewer's understanding through a place, action, decision, consequence or revealing piece of testimony. Visual polish supports that purpose.

## Establish the brief

Record the audience, central question, historical scope, intended running time, release destination and resource limits in `production/brief.json`. Set the frame rate and delivery raster before animating. A short web film and a broadcaster submission may need different deliverables; neither requires a different standard of historical care.

Define the visual language with a small set of choices: map palette, terrain treatment, two complementary typefaces, label hierarchy, symbol system, archive framing, document treatment and transition vocabulary. Save font names and licences. Make these choices data or shared styles rather than repeating them in individual shots.

## Research and evidence

Use `research/sources.csv` to record author or issuing body, creation date, publication date, archive identifier, stable URL, local filename and exact page or timestamp. Keep the original scan or recording where access permits. OCR and transcripts are working derivatives, not replacements for the source.

Use `research/claims.csv` to connect each consequential assertion to its evidence and intended scene. Record conflicting accounts and the wording that the evidence actually supports. Separate an event's date from the date it was reported, commemorated or formally recognized. Do not infer a precise event date solely from a later award or publication date.

Compare independent sources where the claim warrants it. A unit diary, personal letter, newspaper report and later institutional history answer different questions and may repeat one another. Record the source's relationship to the event. Attribute first-person experience to the actual witness; an editor compiling accounts is a different kind of authority.

For military subjects, construct an order of battle when it helps explain the action. Record the date range of each organization, attachment, command relationship and position. Distinguish unit names, abbreviations and echelon markers. A formation's position does not establish the exact location of every person or subordinate unit.

Preserve uncertainty in the film's wording and graphics. Use approximate positions or broader areas when the evidence is approximate. Define casualty categories and reporting periods before visualizing totals; do not imply that all casualties were deaths or that a count is a percentage without a defensible denominator.

## Write for the ear

Draft a two-column sequence plan: what is heard and what is seen. Every map, quotation or archive insert needs a narrative job. Avoid writing a complete essay and then searching for unrelated pictures to fill its duration.

A useful short-film structure is situation, developing pressure or change, consequential action, human experience, outcome and significance. Adapt that structure to the evidence. The final spoken passage should answer the central question and make the consequence clear before the credits begin.

Use concrete subjects and verbs, varied sentence lengths and causal transitions. Explain unfamiliar organizations and geography at the moment they matter. Read the script aloud. Remove repetitive summaries, inflated adjectives and vague phrases such as "history would never be the same" unless the film establishes a specific consequence.

Bridge changes of scale explicitly. A person's experience, a battalion position and a brigade frontage are different views; introduce the wider context before changing the symbol or label. Preserve at least one visual anchor during a map handover.

Introduce figures in a complete sentence with their meaning, then give viewers time to absorb the visual. Correct a likely misunderstanding as part of that sentence rather than adding an abrupt corrective aside. Use quotations for distinctive testimony, not information the narrator could convey more clearly.

Estimate length from an actual timed audition. A rough 115–145 spoken words per minute can help planning, but cadence, names, quotations and silent passages determine the final duration. Reserve time for visual comprehension, transitions and a concise ending. Cut redundant text before increasing delivery speed.

## Build geographically credible maps

Record the coordinate reference system, terrain source, elevation units, vertical datum if known, resolution and any exaggeration. Use a suitable local metric projection for modelling. Keep the mapping from geographic coordinates to Blender coordinates explicit and reproducible. Check control points against source maps before animating.

Present-day data needs historical interpretation. Roads, settlements, forests and watercourses may have changed. Record which features are verified for the period, approximate or used only as a modern geographic reference. Do not fill empty space with invented villages or military positions to make a map seem detailed.

Create visual depth through credible landform, woodland massing, small buildings, surface texture, restrained haze and lighting. Atmospheric effects should not obscure a key position or imply weather that the sources do not establish. Use elevation exaggeration sparingly and disclose it when it materially affects interpretation.

Use a slow oblique or isometric camera with a clear focal area. Keep the horizon and rotation controlled. Smooth movement should have a reason: revealing a route, changing geographic scale or following the action. Avoid constant movement solely to keep the frame busy.

Use depth of field selectively. Keep essential terrain, markers and text within a readable focus range. Put labels in a separate compositing layer when practical, projected from the same camera. Check orientation, mirroring, overlap and contrast throughout the shot, not only at its first frame.

Use a documented symbol convention and a small legend when viewers need one. Contemporary symbols and modern explanatory military symbols serve different purposes; identify the convention and keep echelon marks consistent. Keep labels concise. Superscript ordinal suffixes are optional typography, not a reason to rerender terrain.

Animate routes by arc length rather than by control-point index. Set a consistent perceived movement rate within comparable map scales. For chronology tied to real elapsed time, establish a common time scale instead. Curves of different length should not all rush to completion in the same arbitrary interval.

Stop arrowheads at their intended explanatory endpoint. Avoid driving them into tree meshes or through labels. If an arrow represents pressure rather than a documented penetration, its endpoint must not assert more than the evidence supports. Use explicit holds and gentle entry or exit transitions.

Keep arrows and their shadows in separate passes. A clean terrain plate must match the shot's camera, frame, lighting and colour transform. Replacing an old arrow with a mismatched plate can leave a pale trail ahead of the new one. Inspect motion samples for ghosts, duplicate heads, stuttering, shimmering and changing label positions.

## Select and edit archival material

Choose sources for their relevance and available quality. Check the depicted subject, date, location and unit or organization. A later training film can illustrate a mechanism, but it should not masquerade as footage of the event. Put concise contextual identification on screen when that distinction affects interpretation; keep the full provenance in the asset register and credits.

Record the licence or permission evidence, permitted use, required wording, modifications and any territory or term restrictions in `assets/register.csv`. Treat a watermarked access preview as a review asset until its release status is established. Public availability and historical age do not themselves establish a usable licence. Preserve required marks and attribution.

Keep original files untouched. Store crops, stabilization, grading, restoration and masks as reproducible derivatives. Do not synthesize missing words, faces, medals or archival details and present them as authentic evidence. Clearly identify a reconstruction if one is commissioned.

Use photographs for sustained observation. A restrained push or pan should direct attention without cropping out the important subject. Avoid enlargement beyond what the source can support. For motion footage, preserve intelligible movement and consider the source cadence; aggressive interpolation can invent distracting motion.

Let an archive insert carry a thought. Start with a duration long enough for viewers to identify the subject, then adjust to narration and action. Avoid rapid stock montages as a substitute for coverage. Track reused assets so repetition is deliberate.

For documents, show the authentic page or clipping with enough context to establish what it is. Move from the whole document to the relevant passage, use a restrained highlight, and supply an exact transcription only when needed for readability. Preserve the distinction between a verbatim quotation, an excerpt and a paraphrase. Put detailed references in the research register and credits; retain on-screen source information where it is necessary or required.

For losses or other sensitive quantities, use a clear, restrained graphic. If dots encode people or reported cases, ensure the count and categories agree with the stated data. A gradual row-by-row reveal can communicate scale. Avoid playful effects, implied false precision or treating suffering as a dramatic score counter.

## Narration and pronunciation

Keep the editorial script separate from the pronunciation version submitted to a voice service. Use `audio/pronunciations.csv` for each uncertain name: language, period or regional variant, source, phonetic rendering and audition result. Check a reliable recording or authoritative local source; spelling alone is not enough. Respect a person's or family's supplied pronunciation.

Audition a short passage containing the most difficult names, a quotation and a transition. Prefer an assured, natural delivery with variation and room between ideas. A low voice need not be excessively slow. Re-record awkward phrases at a natural cadence rather than stretching the whole recording.

Save the provider, model, voice identifier, settings, submitted text, generation date and local audio hash. Never commit API keys. Use manageable paragraphs with enough context for consistent delivery; review joins for abrupt changes in tone, volume or room character. Keep the approved takes and original lossless files.

Align captions to the final spoken audio. Display correctly spelled names in captions even if a phonetic spelling was used to obtain the pronunciation. Record whether narration is synthetic and meet the destination's disclosure requirements.

## Music and sound

Choose music with a clear licence and keep attribution and cue information. Use a few coherent cues rather than continuous changes of mood. Place important narration where the arrangement leaves space. Use automation and careful mixing so words remain intelligible without audible pumping.

Keep narration, music and any ambience as separate stems. Preserve a lossless mix before making viewing encodes. Use silence deliberately around consequential testimony or loss; avoid unverified battle sounds that imply a location recording.

Edit music at phrases and resolve the ending. When shortening credits, remove music-only material and make a musical splice without disturbing the approved narration. Measure the result and listen across the join. Loudness normalization does not replace balancing, and a target loudness must come from the chosen delivery specification.

## From sample to complete film

Create a representative sample covering a map move, an archive/document passage and the proposed narration/music relationship. Review it at normal playback size. Agree the direction, benchmark the expensive stages and save the decisions.

Build an animatic for the complete story before production-quality map rendering. Check duration, geographic comprehension, source coverage and the conclusion. Once the content is stable, render reusable scene masters with handles, then finish the typography, markers, captions and transitions in the edit.

Keep revisions specific and timecoded. Revisit script, evidence or geography when needed; reuse accepted material wherever it remains valid. Record what changed and why, and preserve the previous full viewing copy.
