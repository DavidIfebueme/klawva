export const publicListingColumns = [
  "l.id AS id",
  "l.slug AS slug",
  "l.name AS name",
  "l.tagline AS tagline",
  "l.category AS category",
  "l.price_minor AS priceMinor",
  "COALESCE(v.budget_minor, 0) AS budgetMinor",
  "l.current_version AS version",
  "COALESCE(l.author_display, CASE WHEN l.owner_id = 'system' THEN 'klawva' ELSE 'author' END) AS authorDisplay",
  "CASE WHEN l.owner_id = 'system' THEN 'klawva' ELSE 'author' END AS authorKind",
  "(SELECT AVG(rating) FROM session_feedback f WHERE f.listing_id = l.id) AS avgRating",
  "v.score AS score",
].join(", ");

export const publicListingQuery =
  `SELECT ${publicListingColumns} FROM agent_listings l LEFT JOIN listing_versions v ON v.listing_id = l.id AND v.version = l.current_version WHERE l.status = 'published' ORDER BY avgRating DESC NULLS LAST, l.slug`;
