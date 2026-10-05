# agentmonbench-ebg
Project website for AgentMonBench and EBG: What Did the Agent Actually Do? Evidence-Grounded Oversight for Long-Horizon Agents.

Open `index.html` directly, or serve this directory with any static web server.
There is no build step.

The opening figure is exported from the paper's
`figures/motivation_original_text_editable.pdf`. Benchmark examples, statistics,
and results remain in their respective sections; the Codex harness guide sits
near the end, followed by Resources as the final section.

The harness guide uses the public `zhk-lab/EBG` clone URL (which currently
resolves to the same repository as `zhk-lab/BEG`). It includes a Codex hook
support check so an older CLI on `PATH` does not silently defeat the setup.
Keep its commands aligned with `harness/case_studies/README.md` in that repo.

Run the browser checks with `node tests/verify.mjs` after making Playwright
available. Set `PLAYWRIGHT_PATH` to an existing installation when needed.
Windows uses Microsoft Edge; `BROWSER_EXECUTABLE_PATH` can select another browser.
Review screenshots are saved in `.qa/`.
