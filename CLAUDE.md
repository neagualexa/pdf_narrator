# Working on this codebase

## Change the existing logic; don't add beside it

Every fix starts by reading the code that already handles the problem, not by
writing new code next to it. A bug report usually means an existing rule is
wrong or incomplete, so the fix is to correct that rule.

- **Look for the rule that should have handled the case.** Before you add a
  branch, a fallback or a helper, find the code whose job this already is, and
  work out why it got this case wrong. Change that code.
- **Generalise rather than special-case.** If a fix needs a second code path
  that does nearly what an existing one does, merge them into one path that
  covers both. Several searches, passes or heuristics that differ only in their
  thresholds are usually one mechanism with parameters.
- **Delete what a fix supersedes.** When new logic covers what old logic did,
  remove the old logic, its constants and its tests in the same change. Check
  the size of the diff: if a fix only ever adds lines, ask whether something
  should have been removed or replaced.
- **Fix the cause, not where it shows.** A symptom in one layer, such as the
  UI, often comes from bad data produced upstream (extraction, parsing,
  tagging). Trace it back to where the data first goes wrong and fix it there,
  rather than compensating downstream.
- **Prefer rules over patches.** Express a fix as a rule that explains the
  whole class of inputs, such as "text set smaller than the body is not body
  text". A list of the specific strings or cases that failed is a patch, not a
  rule.

## Verify against real data, not only tests

Tests encode the cases someone thought of, and a change can pass all of them
and still regress real documents.

- Reproduce a reported problem with the real input before you change anything.
  Write scratch scripts or temporary tests to inspect intermediate data; don't
  guess from a screenshot.
- After a change to matching, parsing or extraction logic, compare its output
  before and after on a whole real input, not just the case being fixed. Check
  every difference: report the gains, and fix or justify the losses.
- When a regression appears, find which rule caused it and correct the rule.
  Don't add an exception for the case that regressed.
- Keep scratch files in the scratchpad or delete them; never leave them in the
  repo.

## Keep it readable

- Match the surrounding code's naming, comment density and idiom.
- Comments explain *why* a rule exists and what it deliberately doesn't do,
  not what the next line does.
- Name the magic numbers, and say in the name or comment what each one is
  measured against.
- Keep each module to one job. When a module grows a second job, split it
  rather than letting it accrete.

## Reporting

- Say what you verified and how, and what you didn't verify, such as
  behaviour in the browser.
- If a fix exposes a bug that already existed elsewhere, say so and fix it at
  its source instead of working around it.
- Don't commit unless asked.
