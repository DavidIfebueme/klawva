# Studio and publishing

An author creates, tests, and publishes AI employee listings. An admin reviews and approves them.

## Sub-features

- `author-login` magic link login to the studio, same flow as account but landing on `/studio`.
- `listing-create` create a new draft listing with slug, name, tagline, category, price, budget, brief fields, and soul prompt.
- `listing-edit` edit a draft listing's fields. Published listings are locked.
- `sandbox-eval` run the listing's soul in a sandbox against a test prompt, returns a score and band.
- `submit-review` submit a listing for admin review (runs eval, sets state to in_review).
- `cockpit-approve` admin approves a listing, making it published and visible in the marketplace.
- `cockpit-reject` admin rejects a listing with a reason, setting state to rejected.

## How to get to it (user POV)

- Navigate to `/studio/login`, enter email, click the magic link.
- After auth, `/studio` shows the author's listings.
- Admin cockpit at `/studio/cockpit` (admin-only).

## Driving it with chrome-devtools

Preconditions:

- A valid author JWT (magic link flow for an email in ADMIN_EMAILS for cockpit access).
- The studio page loads at `/studio`.

- **Create a listing.** Click "New Listing" to toggle the create form. Fill: slug (`test-agent`), name (`Test Agent`), tagline, category (`ops`), price (1000), budget (500). Add a soul prompt ("You help with operations tasks."). Click Create. The listing card should appear.
- **Open the listing.** Click the new listing card. The editor page loads with all fields populated.
- **Run sandbox.** Click "Run Sandbox". The button shows loading, then a score and band (e.g., "score: 7, band: good") appears.
- **Submit for review.** Click "Submit for Review". The listing state changes to `in_review`.
- **Cockpit review.** Navigate to `/studio/cockpit`. The review queue should show the submitted listing with its name, price, soul preview, and score. Click "Approve". The listing moves to published.
- **Verify in marketplace.** Navigate to `/employees`. The newly approved listing should appear in the grid.
- **Reject flow.** Submit another listing, then in the cockpit click "Reject" with a reason. The listing state changes to `rejected` and the author sees the reason in the studio.

## Gotchas

- Only emails in `ADMIN_EMAILS` can access the cockpit. In production this is `the configured admin email`.
- The sandbox eval calls Workers AI, which may fail on the free tier if the neuron budget is exhausted. The eval returns a fallback score in that case.
- Published listings cannot be edited. They must be unpublished first (admin action) to unlock editing.
- The create form validates slug uniqueness. A duplicate slug returns an error.
