# WO-03 usability test plan

WO-03 item A5 (ADR-026, ADR-027, MOB-001). Written 2026-10-25; run as item E7 once the app is
deployed to a preview behind sign-in.

The engineering gates (G2, G3) say the numbers are right. This gate says real people can get those
numbers without help. It passes only when every task below is completed by every participant, or
the failure is fixed and re-tested. No success rates are invented or estimated; results are
written down as observed.

## Participants

| Role | Who | Device |
| --- | --- | --- |
| Field tech | a TruFicient tech | own phone |
| Installer | a TruFicient installer | own phone |
| Office coordinator | TruFicient office staff | desktop |
| Spanish-speaking tech | Carlos | own phone; the interface is English in WO-03, and the session records where English wording got in the way |

The owner or the builder runs each session. Participants have not seen the app before their
session.

## Setup

- A WorkEdge test project with a real DFW address and no customer data beyond what WorkEdge holds.
- A printed fact sheet for one house (floor area, year built, windows, attic depth, duct location),
  so every participant answers the same house.
- AI is off for the whole order, so every session tests the manual path (ADR-003).

## Tasks (ADR-026 list)

| # | Task | Passes when |
| --- | --- | --- |
| 1 | **Find it.** Open the assessment from the WorkEdge project | the participant reaches the task overview without being shown how |
| 2 | **Complete it.** Answer the quick pass from the fact sheet and run the load | a frozen run exists with the fact sheet's values |
| 3 | **Correct a mistake.** Change a wrong answer the facilitator points out, after a run | the old run shows stale and a new run is made |
| 4 | **Explain its status.** Say whether the job is ready for a report and why | the participant names the missing or stale items the app shows |
| 5 | **Resume after interruption.** Close the app mid-way, reopen, continue | no answer is lost |
| 6 | **Identify assumptions.** Point to which answers were measured and which were defaults | the participant reads it off the app or the PDF |
| 7 | **Manual path.** Enter a blower-door number and a measured attic depth instead of choices | the values show as measured |
| 8 | **Wrong project.** Notice and fix being on the wrong job (office coordinator) | the participant uses "Wrong project?" |
| 9 | **Get the PDF.** Produce the customer summary and find it on the WorkEdge project (office coordinator) | the PDF opens from WorkEdge |

## What is recorded per session

For each task: completed or not, where the participant hesitated or asked for help, wording they
misread, and what they expected instead. Time per task is noted as observed, not compared to a
target. For Carlos, every place where English wording caused a misread is listed separately; that
list decides whether the next order adds a Spanish interface.

Results go in `claude/08-build/wo-03-usability-results.md`, one section per participant, with no
names beyond role and first name.

## Fixing and re-testing

A failed task becomes a fix inside WO-03. The fix is re-tested with the participant who failed it,
or with another participant in the same role if that person is not available.
