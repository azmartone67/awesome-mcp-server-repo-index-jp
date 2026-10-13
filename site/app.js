import {
  DEFAULT_FILTERS,
  findListingIndexes,
  normalizeRepositoryId,
  readFilters,
  writeFilters,
} from "./catalog.mjs";

const state = {
  ...DEFAULT_FILTERS,
  indexes: [],
  generatedAt: "",
};
let coverageRequest;
let lookupVersion = 0;

const elements = {
  search: document.querySelector("#search"),
  activity: document.querySelector("#activity-filter"),
  license: document.querySelector("#license-filter"),
  sort: document.querySelector("#sort"),
  results: document.querySelector("#results"),
  resultCount: document.querySelector("#result-count"),
  empty: document.querySelector("#empty-state"),
  indexStat: document.querySelector("#index-stat"),
  linkStat: document.querySelector("#link-stat"),
  updatedStat: document.querySelector("#updated-stat"),
  repoForm: document.querySelector("#repo-form"),
  repoSearch: document.querySelector("#repo-search"),
  lookupStatus: document.querySelector("#lookup-status"),
  lookupResults: document.querySelector("#lookup-results"),
};

const numberFormatter = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" });

void start();

async function start() {
  try {
    const response = await fetch("./data/indexes.json");
    if (!response.ok) throw new Error(`Dataset request failed: ${response.status}`);
    const data = await response.json();
    state.indexes = data.indexes;
    state.generatedAt = data.generatedAt;

    elements.indexStat.textContent = data.indexes.length.toLocaleString();
    elements.linkStat.textContent = numberFormatter.format(
      data.indexes.reduce((sum, index) => sum + index.analysis.linkedRepositoryCount, 0),
    );
    elements.updatedStat.textContent = dateFormatter.format(new Date(data.generatedAt));
    populateLicenses();
    restoreFilters();
    bindControls();
    render();
    if (state.repository) void lookupRepository();
  } catch (error) {
    elements.resultCount.textContent = "Could not load the catalog.";
    elements.empty.hidden = false;
    elements.empty.textContent = error instanceof Error ? error.message : String(error);
  }
}

function daysSince(timestamp) {
  return (Date.now() - new Date(timestamp).getTime()) / 86_400_000;
}

function matchesActivity(index) {
  const days = daysSince(index.timestamps.pushedAt);
  if (state.activity === "month") return days <= 30;
  if (state.activity === "six-months") return days <= 183;
  if (state.activity === "dormant") return days > 183;
  return true;
}

function searchableText(index) {
  return [index.fullName, index.description, index.license, ...index.topics]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filteredIndexes() {
  const query = state.query.trim().toLowerCase();
  const items = state.indexes.filter(
    (index) =>
      (!query || searchableText(index).includes(query)) &&
      matchesActivity(index) &&
      (state.license === "all" || (index.license ?? "No license") === state.license),
  );

  const comparators = {
    coverage: (a, b) => b.analysis.linkedRepositoryCount - a.analysis.linkedRepositoryCount,
    unique: (a, b) => b.analysis.uniqueLinkedRepositoryCount - a.analysis.uniqueLinkedRepositoryCount,
    stars: (a, b) => b.metrics.stars - a.metrics.stars,
    updated: (a, b) => new Date(b.timestamps.pushedAt) - new Date(a.timestamps.pushedAt),
    name: (a, b) => a.fullName.localeCompare(b.fullName),
  };

  return items.sort(
    (a, b) => comparators[state.sort](a, b) || a.fullName.localeCompare(b.fullName),
  );
}

function metric(label, value, explanation) {
  const wrapper = document.createElement("div");
  const strong = document.createElement("strong");
  const span = document.createElement("span");
  strong.textContent = value === null ? "N/A" : numberFormatter.format(value);
  span.textContent = label;
  if (explanation) wrapper.title = explanation;
  wrapper.append(strong, span);
  return wrapper;
}

function indexCard(index) {
  const article = document.createElement("article");
  article.className = "index-card";

  const heading = document.createElement("h3");
  const link = document.createElement("a");
  link.href = index.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = index.fullName;
  heading.append(link);

  const description = document.createElement("p");
  description.className = "description";
  description.textContent = index.description || "No repository description provided.";

  const metrics = document.createElement("div");
  metrics.className = "metrics";
  const hasCoverage = index.analysis.readmeStatus === "analyzed";
  metrics.append(
    metric("linked repos", hasCoverage ? index.analysis.linkedRepositoryCount : null,
      "Distinct GitHub repositories linked from this index's README."),
    metric("only here", hasCoverage ? index.analysis.uniqueLinkedRepositoryCount : null,
      "Repositories linked by this index and no other index in the dataset."),
    metric("stars", index.metrics.stars),
  );

  const meta = document.createElement("div");
  meta.className = "meta";
  const pushed = document.createElement("span");
  pushed.textContent = `Updated ${dateFormatter.format(new Date(index.timestamps.pushedAt))}`;
  const license = document.createElement("span");
  license.textContent = index.license ?? "No license";
  meta.append(pushed, license);

  const topics = document.createElement("ul");
  topics.className = "topics";
  for (const topic of index.topics.slice(0, 4)) {
    const item = document.createElement("li");
    item.textContent = topic;
    topics.append(item);
  }

  article.append(heading, description, metrics, meta);
  if (!hasCoverage) {
    const unavailable = document.createElement("p");
    unavailable.className = "coverage-unavailable";
    unavailable.textContent = "README unavailable; coverage unknown.";
    article.append(unavailable);
  }
  if (topics.childElementCount) article.append(topics);
  return article;
}

function render() {
  const indexes = filteredIndexes();
  elements.results.replaceChildren(...indexes.map(indexCard));
  elements.resultCount.textContent = `${indexes.length.toLocaleString()} of ${state.indexes.length.toLocaleString()} indexes`;
  elements.empty.hidden = indexes.length !== 0;
}

function populateLicenses() {
  const licenses = [...new Set(state.indexes.map((index) => index.license ?? "No license"))].sort();
  for (const value of licenses) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    elements.license.append(option);
  }
}

function bindControls() {
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    saveFilters();
    render();
  });
  elements.activity.addEventListener("change", (event) => {
    state.activity = event.target.value;
    saveFilters();
    render();
  });
  elements.license.addEventListener("change", (event) => {
    state.license = event.target.value;
    saveFilters();
    render();
  });
  elements.sort.addEventListener("change", (event) => {
    state.sort = event.target.value;
    saveFilters();
    render();
  });
  elements.repoForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.repository = elements.repoSearch.value.trim();
    saveFilters();
    void lookupRepository();
  });
  elements.repoSearch.addEventListener("input", () => {
    lookupVersion++;
    elements.lookupResults.replaceChildren();
    elements.lookupResults.hidden = true;
    elements.lookupStatus.textContent = "";
    state.repository = "";
    saveFilters();
  });
  window.addEventListener("popstate", () => {
    restoreFilters();
    render();
    void lookupRepository();
  });
}

function saveFilters() {
  window.history.replaceState(null, "", writeFilters(new URL(window.location.href), state));
}

function restoreFilters() {
  const licenses = [...elements.license.options].map((option) => option.value);
  Object.assign(state, readFilters(new URL(window.location.href), licenses));
  elements.search.value = state.query;
  elements.activity.value = state.activity;
  elements.license.value = state.license;
  elements.sort.value = state.sort;
  elements.repoSearch.value = state.repository;
}

async function lookupRepository() {
  const version = ++lookupVersion;
  elements.lookupResults.replaceChildren();
  elements.lookupResults.hidden = true;
  if (!state.repository) {
    elements.lookupStatus.textContent = "Enter a GitHub repository to find its listings.";
    return;
  }
  const repositoryId = normalizeRepositoryId(state.repository);
  if (!repositoryId) {
    elements.lookupStatus.textContent = "Enter owner/repo or a GitHub repository URL.";
    return;
  }

  elements.lookupStatus.textContent = "Checking README links…";
  try {
    const coverage = await loadCoverage();
    if (version !== lookupVersion) return;
    const indexes = findListingIndexes(coverage, repositoryId, state.indexes);
    elements.lookupStatus.textContent = indexes.length
      ? `${indexes.length} ${indexes.length === 1 ? "index links" : "indexes link"} to ${repositoryId}. Results use the full dataset, regardless of catalog filters.`
      : `No tracked README links to ${repositoryId}. This does not rule out listings elsewhere on a directory's site.`;
    for (const index of indexes) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = index.url;
      link.textContent = index.fullName;
      link.target = "_blank";
      link.rel = "noreferrer";
      item.append(link);
      elements.lookupResults.append(item);
    }
    elements.lookupResults.hidden = indexes.length === 0;
  } catch {
    if (version === lookupVersion) {
      elements.lookupStatus.textContent = "Could not load coverage. Select Find indexes to try again, or reload the page for the latest dataset.";
    }
  }
}

function loadCoverage() {
  if (!coverageRequest) {
    coverageRequest = fetch("./data/index-links.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("Coverage request failed");
        const coverage = await response.json();
        if (coverage.generatedAt !== state.generatedAt) throw new Error("Dataset versions differ");
        return coverage;
      })
      .catch((error) => {
        coverageRequest = undefined;
        throw error;
      });
  }
  return coverageRequest;
}
