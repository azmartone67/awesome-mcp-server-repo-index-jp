import { GithubRepo, GithubRepoSchema } from "../schema/github.js";
import { classifyIndexRepository } from "./classify.js";

export const GITHUB_INDEX_SEARCH_QUERIES = [
  "awesome-mcp in:name archived:false fork:false",
  "mcp directory in:name archived:false fork:false",
  "mcp registry in:name archived:false fork:false",
  "mcp catalog in:name archived:false fork:false",
] as const;

export type DiscoveryDecision = {
  repo: GithubRepo;
  included: boolean;
  reason: string;
};

export type IndexDiscovery = {
  query: string;
  candidateCount: number;
  repos: GithubRepo[];
  decisions: DiscoveryDecision[];
};

export type RepositorySearchPage = {
  items: unknown[];
  totalCount: number;
  incomplete: boolean;
};

type RepositorySearch = (
  query: string,
  page: number,
) => Promise<RepositorySearchPage>;

const SEARCH_PAGE_SIZE = 100;
const SEARCH_RESULT_LIMIT = 1_000;

export async function discoverMcpIndexes(
  search: RepositorySearch,
  queries: readonly string[] = GITHUB_INDEX_SEARCH_QUERIES,
): Promise<IndexDiscovery> {
  const candidates = new Map<string, GithubRepo>();

  for (const query of queries) {
    for (const repo of await searchAllPages(search, query)) {
      const id = `${repo.owner.login}/${repo.name}`.toLowerCase();
      const existing = candidates.get(id);
      if (!existing || Date.parse(repo.pushed_at) > Date.parse(existing.pushed_at)) {
        candidates.set(id, repo);
      }
    }
  }

  const decisions = [...candidates.values()].map((repo) => ({
    repo,
    ...classifyIndexRepository(repo),
  }));

  return {
    query: queries.join("\n"),
    candidateCount: candidates.size,
    repos: decisions.filter((decision) => decision.included).map(({ repo }) => repo),
    decisions,
  };
}

async function searchAllPages(
  search: RepositorySearch,
  query: string,
): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = [];

  for (let page = 1; page <= SEARCH_RESULT_LIMIT / SEARCH_PAGE_SIZE; page++) {
    const result = await search(query, page);
    if (result.incomplete) {
      throw new Error(`GitHub returned incomplete search results for ${query}`);
    }
    if (result.totalCount > SEARCH_RESULT_LIMIT) {
      throw new Error(
        `GitHub found ${result.totalCount} repositories for ${query}, exceeding its ${SEARCH_RESULT_LIMIT}-result search limit`,
      );
    }

    const items = GithubRepoSchema.array().parse(result.items);
    repos.push(...items);
    if (repos.length >= result.totalCount) return repos;
    if (items.length < SEARCH_PAGE_SIZE) {
      throw new Error(`GitHub returned fewer repositories than expected for ${query}`);
    }
  }

  throw new Error(`GitHub search exceeded the pagination limit for ${query}`);
}
