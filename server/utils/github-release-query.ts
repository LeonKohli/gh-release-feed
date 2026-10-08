export function buildReleaseQuery(opts: {
  includeDescriptionHTML: boolean
  releasesCount: number
}) {
  return `
    fragment ReleaseFields on Release {
      id
      isDraft
      isPrerelease
      name
      tagName
      publishedAt
      updatedAt
      url
      ${opts.includeDescriptionHTML ? 'descriptionHTML' : ''}
    }
    query($cursor: String, $pageSize: Int!) {
      viewer {
        starredRepositories(
          first: $pageSize,
          after: $cursor,
          orderBy: {field: STARRED_AT, direction: DESC}
        ) {
          totalCount
          pageInfo { endCursor hasNextPage }
          edges {
            node {
              id
              name
              url
              description
              forkCount
              visibility
              isArchived
              pushedAt
              homepageUrl
              primaryLanguage { id name color }
              owner { login avatarUrl url }
              stargazerCount
              licenseInfo { spdxId }
              latestRelease { ...ReleaseFields }
              releases(first: ${opts.releasesCount}, orderBy: {field: CREATED_AT, direction: DESC}) {
                totalCount
                pageInfo { hasNextPage endCursor }
                edges { node { ...ReleaseFields } }
              }
            }
          }
        }
      }
      rateLimit { cost limit remaining resetAt used }
    }
  `
}
