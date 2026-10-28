# bundle review on the windows runner

the review host for desktop bundles cannot be a developer laptop, and it cannot be
this repo's linux box either. the job is `bundle-review` in `desktop.yml`, manual
dispatch only.

what it does today:

1. builds the desktop app and the candidate bundle on a clean runner
2. installs the candidate
3. the reviewer runs one staging shift by hand and attaches the logs to the review
   row

what it must grow into before a third-party bundle ships to a stranger:

- install the candidate automatically from the release asset
- run the contract kit against it
- capture the capability sheet render as a screenshot
- run the uninstall purge and assert the declared directories are gone
- fail the review if any of the four is missing

until those land, desktop review is human judgement plus the author's own kit run,
said plainly in the plan so nobody mistakes it for automation.
