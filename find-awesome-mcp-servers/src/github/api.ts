import dotenv from "dotenv";
import { Octokit } from "octokit";
import { EnrichedRepo, GithubRepo } from "../schema/github.js";
import { mapWithConcurrency, withGithubRetry } from "../utils/async.js";
import { delay } from "../utils/delay.js";
import { discoverMcpIndexes, IndexDiscovery } from "./discovery.js";
export type { IndexDiscovery } from "./discovery.js";

dotenv.config({ quiet: true });
const octokit = new Octokit({
  auth:
    process.env.GITHUB_TOKEN ??
    process.env.GH_TOKEN ??
    process.env.REPO_INDEX_TOKEN,
});

const SEARCH_PAGE_DELAY_MS = 500;
const ENRICHMENT_CONCURRENCY = 8;

function logProgress(current: number, total: number, label: string): void {
  const percentage = Math.round((current / total) * 100);
  const bar =
    "█".repeat(Math.floor(percentage / 5)) +
    "░".repeat(20 - Math.floor(percentage / 5));
  process.stdout.write(
    `\r  [${bar}] ${percentage}% (${current}/${total}) ${label}`,
  );
}

export async function fetchMcpIndexes(): Promise<IndexDiscovery> {
  let requests = 0;
  const discovery = await discoverMcpIndexes(async (query, page) => {
    if (requests++ > 0) await delay(SEARCH_PAGE_DELAY_MS);
    const response = await withGithubRetry(() =>
      octokit.rest.search.repos({
        q: query,
        sort: "updated",
        order: "desc",
        per_page: 100,
        page,
      }),
    );

    console.log(`  Search page ${page}: ${query} (${response.data.total_count} candidates)`);
    return {
      items: response.data.items,
      totalCount: response.data.total_count,
      incomplete: response.data.incomplete_results,
    };
  });
  console.log(
    `  ✔ Retained ${discovery.repos.length}/${discovery.candidateCount} repositories with index metadata`,
  );
  return discovery;
}

async function fetchRepoDetails(
  owner: string,
  repo: string,
): Promise<{ subscribers_count: number }> {
  const response = await withGithubRetry(() =>
    octokit.rest.repos.get({ owner, repo }),
  );
  return {
    subscribers_count: response.data.subscribers_count,
  };
}

export async function fetchReadmeContent(
  owner: string,
  repo: string,
): Promise<string | null> {
  try {
    const response = await withGithubRetry(() =>
      octokit.rest.repos.getReadme({ owner, repo }),
    );
    if (Array.isArray(response.data) || !("content" in response.data)) {
      throw new Error(`GitHub returned an unexpected README response for ${owner}/${repo}`);
    }

    return Buffer.from(response.data.content, "base64").toString("utf8");
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number(error.status)
        : undefined;
    if (status === 404) return null;
    throw error;
  }
}

export async function enrichAllRepos(
  repos: GithubRepo[],
): Promise<EnrichedRepo[]> {
  const total = repos.length;
  let completed = 0;

  const enrichedRepos = await mapWithConcurrency(
    repos,
    ENRICHMENT_CONCURRENCY,
    async (repo) => {
    try {
      const details = await fetchRepoDetails(repo.owner.login, repo.name);
        completed++;
        logProgress(completed, total, repo.name);
        return { ...repo, ...details };
    } catch (error) {
      throw new Error(
        `Failed to enrich ${repo.owner.login}/${repo.name}; refusing to publish incomplete metrics`,
        { cause: error },
      );
    }
    },
  );

  process.stdout.write("\n");
  return enrichedRepos;
}
