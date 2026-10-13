export const DEFAULT_FILTERS = {
  query: "",
  activity: "all",
  license: "all",
  sort: "coverage",
  repository: "",
};

const FILTER_PARAMETERS = {
  query: "q",
  activity: "activity",
  license: "license",
  sort: "sort",
  repository: "repo",
};

export function readFilters(url, licenses = []) {
  const filters = { ...DEFAULT_FILTERS };
  for (const [key, parameter] of Object.entries(FILTER_PARAMETERS)) {
    filters[key] = url.searchParams.get(parameter) ?? filters[key];
  }
  if (!["all", "month", "six-months", "dormant"].includes(filters.activity)) {
    filters.activity = DEFAULT_FILTERS.activity;
  }
  if (!["coverage", "unique", "stars", "updated", "name"].includes(filters.sort)) {
    filters.sort = DEFAULT_FILTERS.sort;
  }
  if (filters.license !== "all" && !licenses.includes(filters.license)) {
    filters.license = DEFAULT_FILTERS.license;
  }
  return filters;
}

export function writeFilters(url, filters) {
  const result = new URL(url);
  for (const [key, parameter] of Object.entries(FILTER_PARAMETERS)) {
    if (filters[key] === DEFAULT_FILTERS[key] || !filters[key]) {
      result.searchParams.delete(parameter);
    } else {
      result.searchParams.set(parameter, filters[key]);
    }
  }
  return result;
}

export function normalizeRepositoryId(value) {
  let repository = value.trim();
  if (/^(?:https?:\/\/)?(?:www\.)?github\.com\//i.test(repository)) {
    const url = new URL(/^https?:\/\//i.test(repository) ? repository : `https://${repository}`);
    repository = url.pathname.split("/").slice(1, 3).join("/");
  }
  repository = repository.replace(/\/$/, "").replace(/\.git$/i, "");
  if (!/^[a-z\d](?:[a-z\d-]*[a-z\d])?\/[a-z\d_.-]+$/i.test(repository)) return null;
  if ([".", ".."].includes(repository.split("/")[1])) return null;
  return repository.toLowerCase();
}

export function findListingIndexes(coverage, repositoryId, indexes) {
  const repository = coverage.repositories.find((entry) => entry.repositoryId === repositoryId);
  const listingIds = new Set(repository?.indexes ?? []);
  return indexes
    .filter((index) => listingIds.has(index.id))
    .sort((a, b) => b.metrics.stars - a.metrics.stars || a.fullName.localeCompare(b.fullName));
}
