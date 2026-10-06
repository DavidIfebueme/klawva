# Account management

A logged-in user views their sessions, reads transcripts and reports, submits feedback, manages team members, and unlinks channels.

## Sub-features

- `magic-link-login` request a login link by email, click it, land authenticated.
- `session-list` the account page shows all sessions owned by or shared with the user.
- `session-detail` a session card links to the detail page with brief, transcript, report, and metadata.
- `feedback-form` submit a rating (1-5 stars) and an optional text report.
- `team-members` add a teammate by email, see the member list, remove a member.
- `channel-links` see which channels (telegram, slack, web, email, discord) are linked, unlink one.
- `report-view` the shared report page renders markdown with stats and an employee avatar.

## How to get to it (user POV)

- Click "Account" in the navbar.
- If not logged in, redirected to the studio login page to request a magic link.
- After login, the account page loads with session cards.

## Driving it with chrome-devtools

Preconditions:

- A user account exists with at least one session (e.g., `the account owner's email`).
- A valid JWT is obtained (via the magic link flow or by calling `/api/auth/verify` directly).

- **Navigate to account.** Go to `/account`. If redirected to login, the user is not authenticated. Take a screenshot of whatever loads.
- **Session list.** The page should show session cards with employee name, state badge, channel, and date. Take an ARIA snapshot. Each card should be a link to `/account/sessions/:id`.
- **Open a session.** Click the first session card. The detail page should show: brief fields, transcript (messages in order), report link (if completed), metadata (state, channel, window).
- **Feedback.** If the session is completed, the feedback form appears. Fill a rating (click a star) and optionally type a report. Submit. The form should confirm success.
- **Team members.** The Members card shows current teammates. Type an email and click Add. The new member appears in the list. Click Remove on a member to delete them.
- **Channel links.** The Channels card shows linked channels with chat IDs. Click Unlink on one. It should disappear. The unlink targets one specific chat, not all channels of that type.
- **Report page.** If a report exists, click the report link. The report page renders markdown with the employee name, a stat grid, and a share button.

## Gotchas

- Magic link emails go through Brevo. In local dev the sender may be invalid (the configured Brevo relay sender is rejected by Brevo). Use production for the full auth flow.
- The JWT is stored in localStorage as `klawva_session`. Clearing it logs the user out.
- Unlink sends a DELETE to `/api/account/sessions/:id/channels/:channel/:chatId`. If the chatId contains special characters (like `:` in Slack's `team:channel` format), it must be URL-encoded.
- The report page uses a share token, not the session token. The URL is `/report/:sessionId?shareToken=:token`.
