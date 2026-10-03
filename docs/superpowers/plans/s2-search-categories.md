# S2 Plan: Search and Category Results

## Outcome

Allow visitors to locate catalogue items through text search or category pages, with price filtering and sorting.

## Work

- Validate search text, category identifier, price bounds, sort option, and page parameters on the server.
- Query a bounded result page through the Express API and Prisma.
- Keep search and filter state in URL parameters where practical so a result view can be refreshed or shared.
- Add labelled controls and clear loading, no-result, validation, and API failure states.
- Add database indexes for the filters and ordering used by actual list queries.

## Acceptance checks

- Representative search and category queries return the expected products.
- Price limits and each approved sort option change results correctly.
- Invalid parameters do not crash the route or return an unbounded catalogue.
- Page navigation respects the API's result cap.
- Tests cover query validation, result selection, and empty results.

## Not in this slice

Unapproved facets, external search services, recommendations, or saved searches.
