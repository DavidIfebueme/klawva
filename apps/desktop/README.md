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
