# Say Well

A symptom communication tool for people who find it easier to describe how they feel in a language other than English. Built on the `UI/UX` branch's 3D body painter.

## Evaluation

Say Well is evaluated for **faithfulness**: the English must keep every location, timing, "no" and "not sure" the student gave, and add nothing. On 14 synthetic scenarios in 7 languages (Chinese, Spanish, Arabic, Japanese, French, Hindi, English), the first run dropped explicit negatives and leaked source-language text. After fixes, **14/14 passed**, including corrections, prompt injection, vague input with no invented location, and posterior knee. 61/61 deterministic unit tests pass. Methods, metrics, limitations and how to reproduce: [docs/EVALUATION.md](docs/EVALUATION.md).

## Run locally

```sh
python3 server.py
```

Open http://localhost:8080. Python 3.9+ is sufficient; no packages or build step are required. The server binds to localhost and serves only the `body-painter/` assets.

Without an API key, **manual mode** preserves multilingual input but does not translate or infer symptoms. Users select locations and enter English details themselves.

To enable multilingual interpretation, put `OPENAI_API_KEY=your-key` in a local `.env` file at the repository root, or set `OPENAI_API_KEY` in your shell environment before starting the server. The `.env` file is ignored by Git; shell settings take precedence. Optionally set `OPENAI_MODEL` (default `gpt-4.1`) and `PORT` (default `8080`). The API key stays on the server. The app asks users to opt in before sending symptom text to OpenAI. They can also switch to manual mode.

## Run with a local model (no API key)

Any OpenAI-compatible server works, including a free local model through [Ollama](https://ollama.com):

```sh
ollama pull qwen2.5:7b          # ~4.7 GB; use qwen2.5:3b on 8 GB Macs
cat > .env <<'ENV'
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=qwen2.5:7b
ENV
python3 server.py               # prints "AI on via http://localhost:11434/v1"
```

With `OPENAI_BASE_URL` set, no API key is needed, symptom text never leaves the computer, and requests may take longer (up to 180 s). Local models are smaller than GPT-4.1, so rerun `python3 tests/scenario_agent.py` and review translations before relying on them. A hosted deployment (Replit) cannot reach a model on your laptop; it still needs a hosted API key.

## Deploy (Replit)

Import the GitHub repository into Replit. The included `.replit` runs `HOST=0.0.0.0 PORT=8080 python3 server.py`. Add `OPENAI_API_KEY` under **Secrets** (never commit it), press **Run** to test, then **Deploy** for a public URL. Any host works the same way: set `HOST=0.0.0.0`, `PORT`, and `OPENAI_API_KEY`, then start `python3 server.py`. A public deployment uses your OpenAI key for every visitor, so set a spending limit on the OpenAI account.

## Flow

1. **Describe:** write in any language. With AI enabled, get one relevant follow-up in that language, a visible full English translation of each message, and a separate cumulative English account. You can skip further questions.
2. **Show us where:** review and edit the complete English account, preserving symptom/location/time associations and explicit negatives. Approximate model markings use the bundled model’s bone weights for 24 regions, including hands, wrists, ankles and lower back. Automatic marks update after location corrections; hand-drawn corrections are preserved until explicitly replaced. Correct them using the existing paint, erase, undo, rotation, zoom and arm controls. Location labels remain editable and are independent of freehand marks. Users confirm both before proceeding.
3. **Your statement:** generate and edit a first-person English statement alongside the same body map. Copy it or download self-contained HTML notes containing the statement, original words, location labels and a PNG of the current model view.

No diagnosis or treatment is generated. Unknown details remain unspecified. The mapping is approximate, not anatomical measurement. Clinician review and a qualified interpreter may still be needed. This is a local prototype, not a deployment-ready clinical system.

## Data handling

Conversations and drawings live in page memory and clear on refresh, unless you choose **Save to my history** (see below). The server does not save them or log request bodies. In AI mode, text is sent to OpenAI with `store: false`; provider processing and retention policies still apply. Drawings stay local. Downloaded notes contain symptom information and are saved only when requested. No analytics or external font dependencies are included.

## My history (local only)

Say Well keeps a private symptom diary, so students can look back and notice patterns, such as headaches that come back every spring or knee pain every winter, and bring that to an appointment.

- **Save:** on the statement step, **Save to my history** stores the date and time, body areas and teeth, the English statement, the original words and translations, and a small picture of the model view. Saving again during the same visit updates that entry.
- **My history page** (`/history.html`, linked in the header): summary stats, plain-language **patterns noticed** (an area logged 3+ times with at least 60% of entries in one season is flagged as possibly seasonal; otherwise, 3+ different months is flagged as recurring), entries by month of the year and by season, body-area frequency (click to filter), filters by area, time period and words in any language, and a month-by-month timeline. Delete one, delete all, or download the filtered entries plus patterns as an HTML file.
- **Demo:** `/history.html?demo` shows ten sample entries for presentations. They are never written to storage.
- **Privacy:** entries live only in this browser's `localStorage` (key `saywell.history.v1`). They are never sent to the server or to OpenAI, and are separate per browser and per address (`localhost:8080` and `127.0.0.1:8080` differ). When storage fills up, the oldest entries lose their pictures first and keep their text. Patterns describe timing and frequency only, never a diagnosis. Seasons use Northern Hemisphere months.

## Files

- `server.py`, `interpretation.py`: local static server, strict structured-output contract, and isolated literal translation pass, using the [OpenAI Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
- `body-painter/index.html`, `flow.css`, `flow.js`: responsive three-stage application.
- `body-painter/symptoms.js`: statement construction and export escaping.
- `body-painter/history.js`: local-only history storage and pattern analysis; tested in `tests/history.test.mjs`.
- `body-painter/history.html`, `history-page.js`, `history.css`: the My history page.
- `body-painter/painter.html`, `app.js`, `regions.js`: embedded painter and skeleton-based region selection. The original standalone painter remains available at `/painter.html`.

The existing static preview (`python3 -m http.server 8080`, then `/body-painter/`) still works in manual mode.

## Verification

```sh
python3 -m unittest discover -s tests -v
node --test tests/*.test.mjs
node --check body-painter/flow.js
node --check body-painter/app.js
```

Tests cover interpretation validation, unknown fields, laterality, deduplication, negation, and safe export escaping. Live model interpretation requires a valid API key. A synthetic Chinese symptom example was verified to produce English symptom details and the correct left-knee location.

See [body painter documentation](body-painter/README.md) for model credits and the version 2 annotation save/restore API.


## Scenario testing agent

The independent testing agent added a reusable synthetic user driver:

```sh
python3 tests/scenario_agent.py --output /tmp/say-well-scenarios.json
python3 tests/scenario_agent.py --scenario en_uncertainty --output /tmp/say-well-english.json
```

It exercises 14 scenarios across seven languages, including corrections, multiple symptoms, negation, uncertainty, posterior locations, skipping questions, and instruction injection. These are live API calls (two model calls per interpretation: literal translation and conversational extraction). No real patient data or credentials are included in reports. See [before/after findings](tests/SCENARIO_REPORT.md).

Local verification includes 35 unit/geometry checks. Geometry tests read the actual GLB and verify paintable faces on every supported region and side. Browser checks verified automatic hand painting, right-to-left correction, freehand paint, erasing, confirmation invalidation, and preservation of final statement edits. Scenario checks and visual inspection are regression evidence, not a guarantee of translation accuracy; the original text, translation and editable account stay visible for review.

## Dental map

In “Show us where”, use the **Body / 人体** and **Dental / 牙科** tabs in the model card. Switching preserves each model's annotations. The dental model loads on first use and pauses rendering while hidden. Select teeth alone or include each tooth's adjacent gum; different selection scopes can coexist. Root ends are removed from the displayed geometry.

Dental changes require re-review, as body changes do. In the reviewed statement step, dental annotations are read-only; rotation and zoom remain available. Dental labels appear with body labels in the summary and downloaded notes; downloads capture the currently selected model.

`body-painter/dental-model/index.html` is also a self-contained offline viewer. Its anatomy is adapted from BodyParts3D / Anatomography © DBCLS, via OrganUI, under CC BY-SA 2.1 Japan; see `body-painter/dental-model/ATTRIBUTION.md`. That license applies to the adapted dental model and its renders; the body model retains its separate CC0 license. Rendering libraries retain their MIT licenses, included alongside the viewer.


### Dental symptom interpretation

The dental model UI and tooth names are in English. AI interpretation now returns a separate validated `dental` object. Current tooth/gum symptoms open the dental tab and highlight the described jaw/side/area; explicit unambiguous FDI tooth numbers can select a specific tooth. Broad descriptions show **candidate areas**, not a claim that every highlighted tooth is painful. Unknown locations open an unmarked dental model. Wisdom teeth are not part of this 28-tooth model and are never replaced with a different tooth. Mixed body and dental symptoms retain both sets of markings. Manual dental selections survive later AI updates unless the patient chooses to replace them.

Run dental mapping tests with `node --test tests/dental-regions.test.mjs`. Run six synthetic multilingual live checks with `python3 tests/dental_scenarios.py` (requires the local server and makes API calls).
