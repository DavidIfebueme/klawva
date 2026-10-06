# Checkout and payment

A user fills a brief, picks a channel, enters their email, and pays to launch an AI employee shift.

## Sub-features

- `brief-form` dynamic fields rendered from the listing's briefFields metadata (labels, placeholders, hints, optional flag).
- `channel-picker` select telegram, web, or email as the delivery channel.
- `email-validation` live email validation with inline error.
- `session-creation` submitting creates a session via `POST /api/sessions`.
- `payment-redirect` after session creation, `POST /api/payments/initialize` returns a Paystack checkout URL and the browser redirects.
- `launch-page` after payment, the user lands on `/employees/launch/:session/:token` with a Telegram claim code QR, a web chat link, and a Slack connect link.

## How to get to it (user POV)

- Click "Hire" on an employee detail page.
- Navigate directly to `/checkout?agent=:slug`.

## Driving it with chrome-devtools

Preconditions:

- At least one published listing exists.
- The browser is on the employee detail page for a listing.

- **Navigate to checkout.** Click "Hire" or go to `/checkout?agent=scrapper`. Take a screenshot. The form should show dynamic brief fields from the listing's metadata.
- **Fill the brief.** For each visible text input, fill with a test value. The field labels come from the listing's `briefFields` array.
- **Pick a channel.** Click the "web" channel option (or whichever is available).
- **Enter email.** Fill the email field with `test@example.com`. If invalid, an inline error appears. Use a valid format.
- **Submit.** Click "Pay and launch" (or equivalent submit button). This calls `POST /api/sessions` then `POST /api/payments/initialize`.
- **Verify redirect.** The browser should redirect to Paystack's hosted checkout page, OR if in test mode, to the launch page directly.

## Gotchas

- Payment initialize now requires the session token in the request body. The web app passes `session.sessionToken` from the create response.
- The brief fields are dynamic per listing. A listing with no briefFields shows only the email and channel inputs.
- Paystack test mode may behave differently from production. In test mode the checkout URL may still be valid but the webhook does not fire automatically.
- The launch page needs both the session ID and the session token in the URL path.
