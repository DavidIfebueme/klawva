# deploy runbook

## the co-deploy rule

`0026_report_dispute` and `0028_session_tasks` must land in the same deploy.

dispatch writes the task row, and the first report writes `task_id`, `brief_hash`
and `artifact_hash` onto `mission_reports` in the same moment. split the deploys
and the first hosted report after the migration writes null hashes while its
idempotence row carries a task id its report cannot reference.

check before merging either: `rg --files apps/worker/migrations | rg '0026|0028'`
and confirm both land in one release.

## phase 0 order

1. `0024_manifest_schema`, `0025_version_lifecycle`, `0026_report_dispute`,
   `0027_listing_projection` together with the code that reads the new columns.
2. `0028_session_tasks` in the same release as `0026`.
3. the public projection stops returning `owner_id` in the release that ships `0027` and the catalog change together; the migration alone does not change the api.

## migrations are not grants

a migration creates tables. behaviour (installing a bundle, granting a device,
publishing a version) is written by code. if a migration comment says "grants",
it is wrong.
