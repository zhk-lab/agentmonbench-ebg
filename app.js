"use strict";

// All scores are transcribed from the paper's main-results table.
const results = window.EBG_RESULTS;
const tasks = {
  specgap: {
    dimension: "Requirement–behavior alignment",
    title: "The requirement that never made it into the brief.",
    description:
      "100 repository tasks with 484 consequential conditions removed from their task documents. The implementation still contains the behavior; the brief no longer specifies it.",
    objective:
      "Find the missing conditions, ask useful clarification questions, and locate the code that implements them.",
    kind: "SCORING POLICY",
    labels: ["THE TASK", "THE MISSING CONDITION"],
    steps: [
      "Evaluate two models on 100 questions and report their accuracy.",
      "The document never says how unanswered questions should be scored. Counting them as wrong—or excluding them—can reverse the ranking.",
    ],
    question:
      "Should unanswered questions count as incorrect, or be excluded from the denominator?",
    url: "specgap",
  },
  silentswap: {
    dimension: "Requirement–behavior alignment",
    title: "The tests pass. The meaning changed.",
    description:
      "100 repository tasks, each with five semantic substitutions. The task document stays unchanged and existing tests still pass, while targeted semantic tests expose the difference.",
    objective:
      "Identify the changed behavior, explain its consequences, and localize the supporting implementation.",
    kind: "EVALUATION METRIC",
    labels: ["THE DOCUMENTED BEHAVIOR", "THE ACTUAL IMPLEMENTATION"],
    steps: [
      "Score a prediction using exact match against the reference answer.",
      "The implementation uses semantic similarity instead. “Paris” and “The capital of France is Paris” can now receive credit despite differing text.",
    ],
    question:
      "Which evaluation metric should be used: exact match or semantic similarity?",
    url: "silentswap",
  },
  feedbacktrace: {
    dimension: "Awareness & verification",
    title: "The decision worth checking before the user pushes back.",
    description:
      "100 real Python software-engineering sessions from SWE-chat. Later user feedback identifies the verification target; the monitor sees only the preceding interaction history.",
    objective:
      "Surface a consequential decision, explain what needs user verification, and identify its supporting evidence.",
    kind: "DATA RETENTION",
    labels: ["THE USER EXPECTATION", "THE AGENT’S DECISION"],
    steps: [
      "Keep saved data available when the user reconnects to the session.",
      "Session cleanup deletes saved data. The monitor must recognize the conflict before the later feedback arrives.",
    ],
    question:
      "Should session cleanup delete saved data, or preserve it for reconnection?",
    url: "feedbacktrace",
  },
};

const benchmarks = {
  SpecGap: {
    label: "SpecGAP",
    metrics: [
      ["SF1", "Semantic F1"],
      ["QQ", "Question Quality"],
      ["LF1", "Localization F1"],
    ],
    note: "100 instances. SF1: Semantic F1; QQ: Question Quality; LF1: Localization F1. Semantic metrics average GLM-5.2 and Qwen3.7-Max judgments. The default ordering is by LF1.",
  },
  SilentSwap: {
    label: "SilentSwap",
    metrics: [
      ["LC", "Localization Correctness"],
      ["CC", "Change Correctness"],
      ["LS", "Localization Score"],
    ],
    note: "100 instances with five substitutions each. LC: Localization Correctness; CC: Change Correctness; LS: Localization Score. Semantic metrics average GLM-5.2 and Qwen3.7-Max judgments. The default ordering is by LS.",
  },
  FeedbackTrace: {
    label: "FeedbackTrace",
    metrics: [
      ["VPA", "Verification Point Alignment"],
      ["ESS", "Evidence Support Score"],
      ["EHR", "Evidence Hit Rate"],
    ],
    note: "100 KEY samples, using the complete pre-feedback Long view. VPA: Verification Point Alignment; ESS: Evidence Support Score; EHR: Evidence Hit Rate (at least one exact evidence-ID match). Later feedback is excluded from monitor input. RepoGraph is not applicable. The default ordering is by EHR.",
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = {
  benchmark: "SpecGap",
  method: "all",
  sort: 2,
  descending: true,
};
const metricOrder = [2, 0, 1]; // Put the evidence-localization metric first.

function activateTab(tabs, active) {
  tabs.forEach((tab) => {
    const selected = tab === active;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
}

function setTask(key) {
  const task = tasks[key];
  const active = $(`[data-task="${key}"]`);
  activateTab($$("[data-task]"), active);
  $("#benchmark-panel").setAttribute("aria-labelledby", active.id);
  $("#benchmark-panel").dataset.activeTask = key;
  $("#task-dimension").textContent = task.dimension;
  $("#task-title").textContent = task.title;
  $("#task-description").textContent = task.description;
  $("#task-objective").textContent = task.objective;
  $("#scenario-kind").textContent = task.kind;
  $("#scenario-label-one").textContent = task.labels[0];
  $("#scenario-label-two").textContent = task.labels[1];
  $("#scenario-one").textContent = task.steps[0];
  $("#scenario-two").textContent = task.steps[1];
  $("#scenario-question").textContent = task.question;
  $("#task-docs").href =
    `https://github.com/zhk-lab/EBG/tree/main/benchmarks/${task.url}`;
}

function makeCell(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function renderResults() {
  const config = benchmarks[state.benchmark];
  const header = document.createElement("tr");
  ["#", "Monitor model", "Method"].forEach((label) => {
    const cell = makeCell("th", label);
    cell.scope = "col";
    header.append(cell);
  });
  metricOrder.forEach((index) => {
    const [short, full] = config.metrics[index];
    const cell = document.createElement("th");
    if (index === 2) cell.className = "primary-metric";
    cell.scope = "col";
    cell.setAttribute(
      "aria-sort",
      index === state.sort
        ? state.descending
          ? "descending"
          : "ascending"
        : "none",
    );
    const button = makeCell("button", `${short} `);
    button.type = "button";
    button.title = full;
    button.setAttribute("aria-label", `Sort by ${full}`);
    const indicator = makeCell(
      "span",
      index === state.sort ? (state.descending ? "↓" : "↑") : "↕",
      "sort-indicator",
    );
    indicator.setAttribute("aria-hidden", "true");
    button.append(indicator);
    button.addEventListener("click", () => {
      state.descending = state.sort === index ? !state.descending : true;
      state.sort = index;
      renderResults();
      $("#leaderboard-head")
        .querySelectorAll("button")
        [metricOrder.indexOf(index)].focus({ preventScroll: true });
    });
    cell.append(button);
    header.append(cell);
  });
  $("#leaderboard-head").replaceChildren(header);

  const rows = results
    .filter(
      (record) =>
        record[state.benchmark] &&
        (state.method === "all" || record.method === state.method),
    )
    .sort((a, b) => {
      const difference =
        a[state.benchmark][state.sort] - b[state.benchmark][state.sort];
      return (
        (state.descending ? -difference : difference) ||
        a.model.localeCompare(b.model) ||
        a.method.localeCompare(b.method)
      );
    });
  const body = document.createDocumentFragment();
  let rank = 1;
  rows.forEach((record, index) => {
    if (
      index &&
      record[state.benchmark][state.sort] !==
        rows[index - 1][state.benchmark][state.sort]
    )
      rank = index + 1;
    const row = document.createElement("tr");
    row.classList.toggle("ebg-row", record.method === "EBG");
    row.classList.toggle("top-row", rank === 1 && state.descending);
    row.dataset.model = record.model;
    row.dataset.method = record.method;
    const rankCell = document.createElement("td");
    rankCell.append(
      makeCell(
        "span",
        String(rank),
        rank === 1 && state.descending ? "rank-medal" : "",
      ),
    );
    const modelCell = document.createElement("td");
    modelCell.append(
      makeCell("div", record.model, "model-name"),
      makeCell("div", record.family, "model-family"),
    );
    const methodCell = document.createElement("td");
    methodCell.append(
      makeCell(
        "span",
        record.method,
        `method-pill ${record.method === "EBG" ? "ebg" : ""}`,
      ),
    );
    row.append(rankCell, modelCell, methodCell);
    metricOrder.forEach((metricIndex) => {
      const value = record[state.benchmark][metricIndex];
      const cell = makeCell("td", (value * 100).toFixed(1));
      cell.dataset.score = value;
      if (metricIndex === 2) {
        cell.className = "primary-metric";
        const bar = document.createElement("div");
        bar.className = "cell-bar";
        bar.setAttribute("aria-hidden", "true");
        const fill = document.createElement("span");
        fill.style.width = `${value * 100}%`;
        bar.append(fill);
        cell.append(bar);
      }
      row.append(cell);
    });
    body.append(row);
  });
  $("#leaderboard-body").replaceChildren(body);
  $("#result-count").textContent =
    `${rows.length} configurations · ${config.label}`;
  $("#metric-note").textContent = config.note;
  $(".table-scroll").setAttribute(
    "aria-description",
    `${config.label} results, sorted by ${config.metrics[state.sort][1]} ${state.descending ? "descending" : "ascending"}`,
  );
  $(".table-scroll").scrollTop = 0;
}

function renderInsights() {
  const methods = new Map();
  results.forEach((record) => {
    if (!methods.has(record.model)) methods.set(record.model, {});
    methods.get(record.model)[record.method] = record;
  });
  let improved = 0;
  const gains = {
    SilentSwap: { value: 0, model: "" },
    FeedbackTrace: { value: 0, model: "" },
  };
  for (const [model, records] of methods) {
    for (const benchmark of Object.keys(benchmarks)) {
      const gain = records.EBG[benchmark][2] - records.Base[benchmark][2];
      if (gain > 0) improved++;
      if (gains[benchmark] && gain > gains[benchmark].value)
        gains[benchmark] = { value: gain, model };
    }
  }
  const cards = [
    [
      "CONSISTENT LOCALIZATION GAINS",
      `${improved}/24`,
      "Model × task comparisons with better evidence localization than Base.",
    ],
    [
      "SILENTSWAP · LARGEST LS GAIN",
      `+${(gains.SilentSwap.value * 100).toFixed(1)}`,
      `Points over Base · ${gains.SilentSwap.model}.`,
    ],
    [
      "FEEDBACKTRACE · LARGEST EHR GAIN",
      `+${(gains.FeedbackTrace.value * 100).toFixed(1)}`,
      `Points over Base · ${gains.FeedbackTrace.model}.`,
    ],
  ];
  cards.forEach(([label, value, text]) => {
    const article = document.createElement("article");
    article.className = "insight";
    article.append(
      makeCell("span", label),
      makeCell("strong", value),
      makeCell("p", text),
    );
    $("#results-insights").append(article);
  });
}

$$("[data-task]").forEach((button) =>
  button.addEventListener("click", () => setTask(button.dataset.task)),
);
$$("[data-benchmark]").forEach((button) =>
  button.addEventListener("click", () => {
    state.benchmark = button.dataset.benchmark;
    state.sort = 2;
    state.descending = true;
    activateTab($$("[data-benchmark]"), button);
    $("#leaderboard-panel").setAttribute("aria-labelledby", button.id);
    const repoOption = $('#method-filter option[value="RepoGraph"]');
    repoOption.disabled = state.benchmark === "FeedbackTrace";
    if (repoOption.disabled && state.method === "RepoGraph") {
      state.method = "all";
      $("#method-filter").value = "all";
    }
    renderResults();
  }),
);
$("#method-filter").addEventListener("change", (event) => {
  state.method = event.target.value;
  renderResults();
});

// Arrow, Home, and End keys follow the same selection behavior as a click.
$$('[role="tablist"]').forEach((list) =>
  list.addEventListener("keydown", (event) => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(document.activeElement);
    if (
      index === -1 ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    )
      return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
            tabs.length;
    tabs[next].focus();
    tabs[next].click();
  }),
);

const menuToggle = $(".menu-toggle");
menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute(
    "aria-label",
    open ? "Close navigation" : "Open navigation",
  );
  $("#nav-links").classList.toggle("open", open);
});
$$(".nav-links a").forEach((link) =>
  link.addEventListener("click", () => {
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation");
    $("#nav-links").classList.remove("open");
  }),
);
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    menuToggle.getAttribute("aria-expanded") === "true"
  ) {
    menuToggle.click();
    menuToggle.focus();
  }
});

const figureDialog = $("#figure-dialog");
$$("[data-figure]").forEach((button) =>
  button.addEventListener("click", () => {
    $("#expanded-figure").src = button.dataset.figure;
    $("#expanded-figure").alt = button.dataset.caption;
    $("#figure-caption").textContent = button.dataset.caption;
    $("#figure-dialog-title").textContent =
      button.dataset.title || "EBG · Method overview";
    figureDialog.showModal();
  }),
);
$("#close-figure").addEventListener("click", () => figureDialog.close());
figureDialog.addEventListener("click", (event) => {
  if (event.target !== figureDialog) return;
  const bounds = figureDialog.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    figureDialog.close();
});

const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting);
    if (!visible.length) return;
    const id = visible[0].target.id;
    $$('.nav-links a[href^="#"]').forEach((link) => {
      const current = link.hash === `#${id}`;
      link.classList.toggle("current", current);
      if (current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  },
  { rootMargin: "-15% 0px -65% 0px", threshold: 0 },
);
$$("section[id]").forEach((section) => observer.observe(section));

setTask("specgap");
renderInsights();
renderResults();
