# GitHub API efficiency

Measured on 2026-10-08. The feed now requests nine release summaries per repository in its starred-repository query. This preserves the previous three-page coverage while removing the separate repository requests. Release notes remain a separate request, loaded for the visible feed.

## Measurements

The first comparison used the same 60 starred repositories and omitted release-note HTML. Sizes are JSON output bytes before compression. Times include a `gh api graphql` process, authentication setup, and network time.

| Query                                                 | API points | JSON bytes | Duration |
| ----------------------------------------------------- | ---------: | ---------: | -------: |
| 60 repositories, 3 releases, languages connection     |          1 |    104,465 | 7,989 ms |
| 60 repositories, 3 releases, no languages connection  |          1 |     90,060 | 6,385 ms |
| 60 repositories, 9 releases, languages connection     |          1 |    162,299 | 8,369 ms |
| 60 repositories, 9 releases, no languages connection  |          1 |    147,894 | 5,748 ms |
| 20 repositories, 9 releases, no languages connection  |          1 |     43,004 | 3,110 ms |
| 100 repositories, 9 releases, no languages connection |          1 |    254,870 | 8,437 ms |

The 60-repository sample contained 125 release edges in the first three-item pages and 346 in the nine-item pages. Thirty-nine repositories had a second page, and 36 had a third page. The old client would therefore make 75 follow-up requests, each costing at least one point, before scanning the next starred-repository page. Including the first page, that is at least 76 points versus one point for the same bounded release coverage. This is a calculation from returned pagination metadata; the experiment did not execute all 75 requests.

A separate `vuejs/core` experiment executed both strategies and compared every returned release field:

| Coverage                      | Requests | API points | JSON bytes | Duration |
| ----------------------------- | -------: | ---------: | ---------: | -------: |
| Three pages of three releases |        3 |          3 |      2,777 | 1,850 ms |
| One page of nine releases     |        1 |          1 |      2,437 |   522 ms |

Both strategies returned the same nine release objects in the same order. The timing figures are single observations, not a latency guarantee. Different accounts, repository activity, network conditions, and GitHub load change the results. The CLI experiment also excludes the app server's cache and request scheduler.

A controlled client benchmark isolates the app's pagination behavior. It uses 20 busy repositories on the first starred page, one repository on the next page, and 100 ms of simulated HTTP latency. Notes are inline and IndexedDB is disabled, so this comparison measures release pagination alone.

| Client version                                  | Release records | App HTTP requests | First records | Next starred page |   Complete |
| ----------------------------------------------- | --------------: | ----------------: | ------------: | ----------------: | ---------: |
| Baseline `c1858f4`, three releases per response |             183 |                42 |        105 ms |          5,273 ms |   5,275 ms |
| Current, nine releases per response             |             183 |                 2 |    106–107 ms |        208–209 ms | 209–212 ms |

The controlled run preserves the first useful response while removing 40 repository requests and the delay before scanning the next page. These are simulated app HTTP timings, not real GitHub latency or measured GraphQL costs.

## Why this query costs less

GitHub's primary GraphQL cost depends on connection traversal, with a minimum cost of one point per request. Increasing one repository connection from three to nine release nodes did not change the measured point cost. Removing a repository request saves its minimum point charge. The unused `languages` connection also added 14,405 bytes to the 60-repository sample. The preview only uses `primaryLanguage`. [GitHub GraphQL limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)

The application keeps `latestRelease` alongside the nine connection edges and deduplicates release IDs. A live schema introspection confirmed that `Repository.releases` accepts pagination and ordering arguments, but no publication-date or prerelease filter. Stable and prerelease filtering therefore remains local. GitHub's REST latest-release endpoint documents a full, non-draft, non-prerelease release; its creation timestamp can differ from its publication timestamp. [Release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)

The feed still covers recent releases published within three months, with nine connection entries per repository plus `latestRelease`. It does not claim a complete three-month release history for repositories with more frequent releases. Starred repositories are ordered by when the user starred them, so an old release in one repository does not justify stopping the account scan.

The client loads 20 repositories first and then uses pages of 100. Each page follows the returned cursor and `hasNextPage`. The smaller first page makes useful records available earlier while later pages reduce request count. [GraphQL pagination](https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api)

## Cache and retry behavior

The server retains a per-user cache and coalesces identical feed requests. A cache hit or a coalesced follower reports zero additional API points. An explicit refresh sends `refresh=true` and bypasses the server's cached response. The fresh result replaces that cache. Authenticated responses use `Cache-Control: private, no-store`, so the browser cannot replay a previous account's response or an old API-cost value. IndexedDB keeps the feed available during refresh and failure.

Release-note cache keys include the requested `updatedAt` version. An empty description is a valid cached result. The server returns GitHub's actual `updatedAt` and avoids storing a response under a mismatched version. This prevents an edited release from retrieving the previous notes from the ten-minute server cache.

Transient failures have one bounded retry policy in the shared GitHub client. Authentication failures and quota exhaustion reach the UI. GraphQL can report quota exhaustion with HTTP 200, so the error handler checks `RATE_LIMITED` entries as well as response headers. The UI disables retries until GitHub's retry deadline and blocks additional queued requests during that period. GitHub requires callers to honor `Retry-After` or the quota reset time before retrying. [GitHub rate-limit handling](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api#exceeding-the-rate-limit)

The installed `@octokit/plugin-throttling` 11.0.5 schedules GraphQL requests through a limiter with a one-second minimum interval. The previous default limiter ID also shared scheduling across unrelated credentials. The shared client now derives the limiter ID from a hash of the credential. These findings come from the installed package source in `dist-src/index.js` and `dist-src/wrap-request.js`.

## Alternatives

REST conditional GET requests can return `304 Not Modified` without consuming primary quota when authenticated. That helps a service which repeatedly polls a fixed set of repositories. This app would still need one releases request per repository, and REST list responses include data the feed does not need. The batched GraphQL query is the smaller change for an interactive starred feed. [REST cache guidance](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests)

Atom feeds would also require a request per repository. The existing Atom implementation infers prerelease state rather than receiving GitHub's typed `isPrerelease` field. It is unsuitable as the source of truth for these filters. The official feeds endpoint describes timeline feeds, not a batched release-history query for all starred repositories. [Feeds API](https://docs.github.com/en/rest/activity/feeds)

Webhooks can replace polling for repositories where an integration can receive release events. A user's stars alone do not give this app webhook delivery for every project they bookmark. A continuously updated shared release index would require separate persistence, subscriptions, and operations. That is a different architecture from the current OAuth reader. [Release webhook](https://docs.github.com/en/webhooks/webhook-events-and-payloads#release)

## Reproduction

The production query is exported by `server/utils/github-release-query.ts`. Run a small query with the account already authenticated in `gh`:

```bash
bun --no-env-file -e '
	import { buildReleaseQuery } from "./server/utils/github-release-query.ts"
	console.log(JSON.stringify({
		query: buildReleaseQuery({ includeDescriptionHTML: false, releasesCount: 9 }),
		variables: { pageSize: 20, cursor: null },
	}))
' | gh api graphql --input - --jq '{points: .data.rateLimit.cost, repositories: (.data.viewer.starredRepositories.edges | length)}'
```

The controlled client benchmark records request counts, returned releases, and timings:

```bash
BENCHMARK_RELEASE_COUNT=9 bun --no-env-file scripts/benchmark-feed.ts
```

To reproduce the controlled baseline, copy the benchmark script into a checkout of commit `c1858f4` and run it with `BENCHMARK_RELEASE_COUNT=3`. For real API comparisons, keep the account and query parameters identical. Do not publish raw account responses or credentials with benchmark results.

## Browser verification

The production build was exercised with mocked authenticated API responses at desktop and 390 px mobile widths. Visible cards request notes; unloaded notes can be included explicitly in search. A simulated 503 refresh preserves cards and loaded notes. The mobile layout has no horizontal overflow. The [mobile screenshot](github-api-mobile.png) uses fixture data.
