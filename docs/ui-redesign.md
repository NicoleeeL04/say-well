# Say Well UI/UX redesign

Implemented by a UI/UX designer sub-agent using the user-supplied `skills-main` principles from `emil-design-eng`, `apple-design`, and `mobile-native`.

The direction is a calm, readable symptom workspace: restrained blue/slate colors, system typography, consistent control hierarchy, and no new runtime dependencies or remote fonts.

| Before | After | Purpose |
| --- | --- | --- |
| Consent after the composer | Consent before composing/submitting | Make the data-sharing choice visible |
| Feedback at the page bottom | Feedback beside the active interaction | Keep errors and completion messages in context |
| Model-first mobile review | Description, then model, then confirmation | Make the review order predictable |
| Mixed body/dental control styles | Shared typography, colors and touch targets | Make the tools feel part of one product |
| Every painter option always visible | Primary tools plus an optional controls panel | Reduce clutter while retaining functionality |
| Nested scrolling in the body frame | Frame follows its content height | Keep page scrolling predictable |
| Summary prompts suggesting edits | Explicit reviewed-model instructions | Match guidance to read-only model state |

Motion is limited to brief interaction feedback. Reduced-motion, reduced-transparency and increased-contrast preferences are handled. Stage changes focus the heading without a scroll animation. Long multilingual text can wrap without widening the layout.

## Verification

- 42 existing Python/JavaScript unit and geometry checks passed.
- Browser-tested consent feedback, a live mixed body/dental example, manual input, long Arabic text, body painting, model switching, and final review.
- Checked a 390px narrow viewport and desktop layout.
- Checked expanded body tools for horizontal overflow and matching iframe height.
- Dental upper/lower arches fit a 339px-wide viewport after responsive camera fitting; footer and hint text no longer overlap.
- Physical-phone keyboard, touch and safe-area behavior were not tested on hardware.

The redesign preserves the interpretation contract, original-message translations, explicit AI consent, candidate dental labels, manual annotation controls, editable final statement, and local exports. No credentials or patient data are part of this design record.
