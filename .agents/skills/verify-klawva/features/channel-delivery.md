# Channel delivery

Users interact with their AI employee through Telegram, Slack, Discord, and email in addition to the web chat.

## Sub-features

- `telegram-claim` redeem a claim code via `/start <code>` in Telegram to link a chat to a session.
- `telegram-chat` send messages in Telegram, receive replies from the session agent.
- `telegram-commands` `/sessions`, `/switch`, `/status`, `/report`, `/help` all work.
- `slack-mention` `@Klawva` in a Slack channel routes the message to the user's latest session.
- `discord-ask` `/ask session:<id>/<token> message:<text>` sends a message to a session with token verification.
- `email-inbound` sending to `employees@klawva.xyz` routes the message to the sender's active session.
- `shift-complete-notify` when a shift ends, all linked Telegram chats are notified with the report URL.

## How to get to it (user POV)

- Telegram: open the bot link from the launch page, send `/start <code>`.
- Slack: `@Klawva` in any channel where the app is installed.
- Discord: `/ask` slash command in a server where the bot is added.
- Email: send to `employees@klawva.xyz` from the email used at checkout.

## Driving it with chrome-devtools

Preconditions:

- For Telegram: a Telegram account and the bot username from `/api/config`.
- For Slack: the Klawva app installed in a workspace with a saved connection in D1.
- For Discord: the bot added to a server (not currently set up).
- For email: `employees@klawva.xyz` routing enabled in Cloudflare Email Routing.

Telegram and Slack are external services that cannot be driven from chrome-devtools. Verify them by:

- **Slack API probe.** Send a test event to the events endpoint and check the D1 for a new message row:
  ```bash
  # Check the connection exists
  wrangler d1 execute klawva --remote --json --command "SELECT external_id FROM connections WHERE provider='slack'"
  ```
- **Telegram webhook probe.** The webhook at `/webhooks/telegram` accepts signed POST requests. Signature verification prevents testing without the bot token.
- **Email probe.** Send an email to `employees@klawva.xyz` from a different address than the Gmail forwarding destination. Check D1 for a new message row.

For web-verifiable channel behavior:

- **Launch page links.** On `/employees/launch/:session/:token`, verify: Telegram deep link contains the claim code, "Chat on the web" links to `/chat/:id?token=:token`, "Connect Slack" links to `/api/slack/install?session=:id&token=:token`.
- **Channel links in account.** On `/account/sessions/:id`, the Channels card shows which channels are linked. Unlinking one removes it.

## Gotchas

- Slack resolves the newest session per connected user with no switch command. A user with multiple sessions always drives the latest one via Slack.
- Discord `/ask` requires the session token in the session option as `<id>/<token>`. Without it, the bot refuses.
- Email resolves the newest active session per sender email. If the sender has multiple sessions, only the latest is reached.
- The Telegram claim code is single-use (enforced with `AND used_at IS NULL`). A second `/start` with the same code fails.
- Shift-complete notifications loop over ALL linked Telegram chats, not just the first.
