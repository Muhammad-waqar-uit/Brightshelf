# Capture Test

## Tool and Model

- Tool: GitHub Copilot in VS Code, Local harness.
- Model selection: Auto. The Local hook does not expose which model handled an individual turn; logs record `not exposed by Local hook` rather than guessing.
- Planning/execution split: Not exposed by this session.
- Author: `muhammad-waqar-uit`.

## Capture Mechanism

The VS Code Local lifecycle hooks capture submitted prompts with `UserPromptSubmit` and, at `Stop`, read the session transcript and append only the latest visible assistant message after that prompt. Tool events and reasoning text are excluded.

- Hook configuration: `.github/hooks/capture-agent.json`
- Capture script: `.github/hooks/capture-agent.cjs`
- First canary log: `.agent-logs/2026-10-01_23-24-27_f835887a-725a-4683-aad4-49036d7ddc5e.md`
- Second canary log: `.agent-logs/2026-10-01_23-29-09_44c8ea9a-ea66-414c-9602-161a7a9ac0f4.md`

Both canaries were recorded in separate Local sessions, including each prompt and its final response.

## Raw Canary Entries

### Canary 1

```text
[LOG_ENTRY type=PROMPT num=1 session=f835887a-725a-4683-aad4-49036d7ddc5e]
timestamp: 2026-10-01T23:24:27.516Z
model: not exposed by Local hook

CAPTURE TEST — 8x assignment, Muhammad Waqar

[LOG_ENTRY type=RESPONSE num=1 session=f835887a-725a-4683-aad4-49036d7ddc5e]
timestamp: 2026-10-01T23:27:31.365Z
model: not exposed by Local hook

## ✅ Capture test verified

The canary prompt has been recorded in:
- [.agent-logs/2026-10-01_23-24-27_f835887a-725a-4683-aad4-49036d7ddc5e.md](.agent-logs/2026-10-01_23-24-27_f835887a-725a-4683-aad4-49036d7ddc5e.md)

The earlier session log is also preserved here:
- [.agent-logs/2026-10-01_23-15-13_0528a839-8a40-4e78-a563-4d341fc479c9.md](.agent-logs/2026-10-01_23-15-13_0528a839-8a40-4e78-a563-4d341fc479c9.md)

This matches the required capture for “CAPTURE TEST — 8x assignment, Muhammad Waqar.”
```

### Canary 2

```text
[LOG_ENTRY type=PROMPT num=1 session=44c8ea9a-ea66-414c-9602-161a7a9ac0f4]
timestamp: 2026-10-01T23:29:09.514Z
model: not exposed by Local hook

`CAPTURE TEST — 8x assignment, Muhammad Waqar`

[LOG_ENTRY type=RESPONSE num=1 session=44c8ea9a-ea66-414c-9602-161a7a9ac0f4]
timestamp: 2026-10-01T23:29:19.083Z
model: not exposed by Local hook

## ✅ Capture test complete

The required capture entry for “CAPTURE TEST — 8x assignment, Muhammad Waqar” is present in:
- [.agent-logs/2026-10-01_23-24-27_f835887a-725a-4683-aad4-49036d7ddc5e.md](.agent-logs/2026-10-01_23-24-27_f835887a-725a-4683-aad4-49036d7ddc5e.md)

This is the recorded session log for the assignment capture.
```

## Initial Attempts That Did Not Work

- I ran `Select-String` from the Bash terminal; it was unavailable there. PowerShell was used instead.
- `rg` was not installed in the Bash terminal, so transcript inspection used PowerShell.
- A PowerShell 5.1 transcript check used the unsupported `ConvertFrom-Json -AsHashtable` parameter; it was replaced with compatible `ConvertFrom-Json` parsing.