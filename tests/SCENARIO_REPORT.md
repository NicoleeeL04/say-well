# Independent scenario testing

All examples are synthetic. The live test driver is `tests/scenario_agent.py`; it calls the local application's interpretation endpoint and never reads or prints credentials. It covers Chinese, Spanish, Arabic, Japanese, French, Hindi and English, plus correction, retraction and instruction-override cases.

## Before fixes

The initial 10-scenario run exposed:

- Chinese, Arabic, Japanese and Hindi symptom detail fields remained in the source language instead of English.
- Explicit negatives were dropped: the Chinese example's “no fever” and Arabic example's “not pain.”
- An English uncertainty example received a Spanish follow-up.
- Spanish lower-right abdominal symptoms, French headache plus right-wrist pain, and Spanish ankle injury each returned HTTP 400.
- Hindi lower-back pain was mapped to the hip.
- The API had no complete English translation of the original description.

Source review also found:

- Returning to chat and correcting a location did not replace existing automatic marks, because any nonzero stroke count caused auto-paint to be skipped.
- Entering stage 2 before the painter finished loading did not retry auto-paint.
- Final text attached all locations to a single symptom string, potentially conflating distinct symptoms and onsets.

Initial raw synthetic responses were saved outside the repository at `/tmp/say-well-before.json`. The first driver version checked location shape only; a location pass did **not** mean translation quality passed. The current driver additionally checks complete English translation, cumulative statement, source-script leakage, selected negations and factual details, corrections/retractions, and injection resistance.

## After fixes

The revised application was tested with 14 scenarios. The first assertion set passed all 14, and semantic inspection confirmed corrected English details, negations, symptom/onset associations, precise wrist/ankle/lower-back locations, correction and retraction handling, posterior-knee surface, and a request to skip follow-ups. The isolated translation pass removed the earlier Japanese assistant-question contamination and retained the full correction wording.

Semantic inspection caught a gap in the assertions: the English uncertainty example's separate translation unexpectedly came back in Spanish while the cumulative statement stayed English. The harness now checks that specific translation independently. The server now preserves an English source message verbatim when the isolated translator identifies its language as English. Targeted retests of the English uncertainty case, Japanese fatigue, and Chinese correction all passed after that fix, and their full translations were inspected. The English sentence is unchanged; Japanese adds no question; Chinese retains the explicit left/not-right correction and timing.

Final-round raw synthetic responses: `/tmp/say-well-final.json`. Post-fix targeted results: `/tmp/say-well-english-retest.json`, `/tmp/say-well-japanese-retest.json`, `/tmp/say-well-correction-retest.json`. The full 14-case run preceded the final English-preservation change; the affected case and two non-English controls were then rerun. No test process remains running. Deterministic assertions are regression signals, not a clinical or comprehensive linguistic validation; full responses still need semantic review.

## Run again

```sh
python3 tests/scenario_agent.py --output /tmp/say-well-scenarios.json
python3 tests/scenario_agent.py --scenario en_uncertainty --output /tmp/say-well-english.json
```

Requires the local application server with a configured OpenAI key. These checks make real API requests with synthetic data only. The test harness validates the API, not WebGL rendering; actual paint, erase, rotation, and stage transitions require the separate browser/geometry checks.


## Browser and mesh verification

The primary agent verified the actual UI with a Chinese right-hand numbness report, followed by a correction to the left hand. Full English translations were visible in the chat; the narrative retained “not painful” and “no other symptoms”; the right-hand mark disappeared and the left hand was painted. Freehand drawing visibly added a stroke, a matched paint/erase click removed the painted center, and manual edits invalidated confirmation. A final-statement edit survived going back to the map and returning to the statement. Separate geometry tests verified all 24 regions on both sides against the actual bundled GLB, plus posterior-knee separation and hand/torso isolation.
