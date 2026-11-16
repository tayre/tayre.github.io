# Historical documentary framework

A reusable production framework for short historical documentaries built from primary sources, archival photographs and footage, Blender maps, narration and music. The intended style is restrained and cinematic: clear geography, patient camera movement, readable typography, natural speech and a story that reaches a conclusion.

This is a production playbook and starter kit, not a finished film generator. It contains no film-specific research, media, credentials or paid assets. Use it for a new subject and improve it as the workflow develops.

## Start a project

1. Copy and fill in the [starter prompt](STARTER-PROMPT.md).
2. Create a separate project directory with Python 3.10 or later:

   ```bash
   python3 historic-documentary/scripts/new_project.py ../documentary-project --title "Working title"
   ```

3. Fill in `production/brief.json` in that project. Choose the subject, audience, duration, delivery format, resource limits and budget before production rendering.
4. Follow the [production playbook](references/production-playbook.md), starting with research and a short visual and narration sample.
5. Use the [technical setup](references/technical-setup.md) to record the actual tools and prepare the project. Use the [review and delivery guide](references/review-delivery.md) before exporting.

The initializer copies this framework into the new project's `framework/` directory, with a checksum manifest. It creates research registers, a production brief, an empty timeline, a recovery note and project instructions. It refuses an existing destination. It does not install software, buy services, download material, start rendering or publish anything.

## Use with an assistant

Ask the assistant to read [SKILL.md](SKILL.md) and the starter prompt. The folder is also a self-contained Codex skill named `historic-documentary`; repository use does not require installing it globally. The generated project's `AGENTS.md` points to its local copy of the skill.

The skill routes to detailed guidance only when needed. Project decisions belong in the brief and decision log, so a preference for one production does not silently become a requirement for every later film.

## What is included

| File or folder | Purpose |
| --- | --- |
| `STARTER-PROMPT.md` | Reusable commissioning prompt and adjustable creative defaults |
| `references/production-playbook.md` | Research, writing, maps, archival editing, voice and music |
| `references/technical-setup.md` | Tool setup, project structure, render design and resource controls |
| `references/review-delivery.md` | Historical, visual, audio, rights and export checks |
| `templates/` | Brief, source and claim registers, asset register, pronunciations, sequence plan, timeline and recovery note |
| `scripts/new_project.py` | Create an isolated project without overwriting existing work |
| `scripts/preflight.py` | Report tool versions, free space and configured limits |
| `scripts/checkpoint.py` | Save and verify recoverable editable files and a media inventory |
| `IMPROVEMENTS.md` | Record reusable lessons and their evidence |

## Improve the framework

Record an observation, the change made and the result in `IMPROVEMENTS.md`. Update the smallest relevant rule or template. Keep subject-specific facts and production assets in the individual project. Existing projects retain their framework snapshot; adopt later changes deliberately and record the new revision.

Source-control text, scripts and small manifests. Keep original media, large renders, credentials and licence receipts in appropriate project storage with a separate backup. Review copies and release masters are separate deliverables.

After changing the helpers, run `python3 -m unittest discover -s historic-documentary/tests -v` from the repository root. The checks use temporary projects and cover overwrite protection, recoverable checkpoint contents, corruption detection and resource limits.
