# Independent input-focus review

## Reported failure

The redesigned text window cannot be clicked into reliably to enter symptoms.

## Confirmed source-level cause

The redesign added `data-step="1"` to `<body>` for stage-specific CSS. Both progress-navigation loops in `flow.js` still selected every `[data-step]` element. The click-binding loop therefore assigned an `onclick` handler to the body as well as the three progress buttons.

A normal click inside a textarea bubbles to the body. Its handler re-enters the current stage and `changeStep()` explicitly focuses the page heading. As a result, the textarea immediately loses focus and the screen may scroll. This affects the initial description, the English review field, and the editable final statement. It is not caused by an overlay or missing pointer-event styling.

## Reproduction paths

1. Fresh load: click the symptom textarea, then type. The body click handler calls `changeStep(1)` and moves focus to the page heading.
2. Review stage: click the English description. The body handler calls `changeStep(2)`, moves focus to the heading, and repeats model synchronization.
3. Final stage: click the statement. The body handler calls `showSummary()`, which calls `changeStep(3)` and moves focus to the heading.
4. Click other ordinary controls, such as consent or a model tab. Their events also bubble to the body handler and can cause unwanted stage re-entry and scrolling.

## Fix and regression checks

Restrict the navigation selector to actual progress buttons, such as `.progress-nav button[data-step]`, in both the state-update and event-binding loops. Stage styling on the body can remain.

The browser regression should use a normal click (not only a programmatic field fill), then keyboard typing, and verify all of:

- Initial symptom input keeps focus and accepts text.
- English review input keeps focus and accepts edits.
- Final statement keeps focus and accepts edits.
- Clicking consent and switching model tabs does not focus the page heading or re-enter the current stage.
- Actual progress navigation still changes stages and focuses the stage heading appropriately.

The parent agent owns browser verification. This review does not claim a browser pass without that verification.

## Separate expected behavior

While interpretation is pending, `setBusy(true)` deliberately disables the initial textarea until success, failure, or timeout (up to 65 seconds). That is a separate drafting limitation; it does not explain loss of focus on a fresh idle page.

## Fix verification

Both navigation selectors are now scoped to `.progress-nav button[data-step]`. The parent browser check reproduced the original failure: clicking the description field left `page-title` focused. Post-fix browser checks were completed by the parent agent using normal clicks followed by native typing, rather than programmatic field filling.

Local verification after the selector fix:

- Python unittest suite: **8 passed**.
- Node test suite: **34 passed**, including body-region mesh coverage, posterior surfaces, dental selection/correction handling, symptom wording, and safe export escaping.
- JavaScript syntax checks: `flow.js` and `model-switcher.js` passed.
- `git diff --check`: passed.
- Literal DOM ID references from the flow and painter scripts match the redesigned HTML; no missing references or duplicate IDs were found.

Review of the other redesign changes found no additional source-level click-blocking overlay, pointer-event rule, or global focus handler. Model controls retain their IDs and the iframe resizing accounts for the expanded brush options. These source checks supplement rather than replace click-and-type browser checks.

No live API requests were made during this focus-regression review.

## Observed browser regression results

The parent agent verified the following after the fix:

- Initial English input retains `description` focus and accepts typed text.
- Clicking AI consent retains focus on `consent`.
- Manual send advances to review; the English textarea retains `review-english` focus and accepts edits.
- Selecting the dental tab retains `dental-tab` focus and stays in stage 2; switching back to the body tab works.
- Confirmation advances to the summary; `statement` retains focus and accepts edits.
- Clicking the actual progress navigation intentionally returns to stage 1 and focuses the heading.
- Chinese input `昨天开始牙痛。` is accepted while `description` remains focused.

The original failure was reproduced before the fix, and the affected click-and-type paths passed afterward.
