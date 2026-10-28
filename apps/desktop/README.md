# klawva desktop

the klawva desktop app. pairs with your account, runs your desktop employees
against your own workspace, keeps your connector secrets on your machine.

## token vault

on windows, secrets (gmail refresh token, device token) are encrypted with
dpapi under your login and only your windows account can decrypt them.

on linux and mac, the vault is not encrypted yet: the `.secret` files under
`~/klawva/vault/` are base64 plaintext with `0600` permissions, so only your
user can read them, but any process running as you can too. os keychain
storage lands before mac ships.

## google oauth, first cohort

the google cloud project behind the desktop app asks for `gmail.readonly` and
`gmail.compose`. both are restricted scopes, and the app stays unverified until
the paid third party assessment happens, so:

- the oauth consent screen shows the "unverified app" warning. that is expected
  for the first cohort, not a bug.
- google caps an unverified app at 100 users. each google account that grants the
  connector counts once.
- `gmail.compose` can send. the draft-only rule is enforced in our code, not by
  the scope, so do not relax the approval step.
- the test user list in the cloud console must contain every account that connects
  during the cohort.
