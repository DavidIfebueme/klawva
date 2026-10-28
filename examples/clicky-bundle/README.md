# clicky reference bundle

the reference port for the desktop lane. a windows screen-and-click agent, wrapped
so it speaks the loopback a2a contract.

what is here:

- `bundle.json`, the manifest the app reads at install: capabilities, data dirs,
  platform, loopback transport.
- `adapter.mjs`, the loopback server the supervisor spawns. it reads the port and
  nonce from the environment, binds `127.0.0.1` only, and refuses any first call
  that does not quote the nonce.

the handshake has two halves: the supervisor passes the port and nonce by
environment, and the adapter prints one line on stdout quoting the nonce, so the
supervisor knows the process on the port is the child it spawned.

residual, stated plainly: after the first call the nonce is not re-checked, so any
same-user process can drive the adapter once it is running. that is a named limit
of the loopback contract, not an oversight.

what is not here: the clicky core. the author supplies it. the adapter calls into
it through `runTask`, which is where a real integration plugs in.

the honest status: this is the shape, not a shipped bundle. it exists so the
contract has a reference implementation and so the review checklist has something
to run against before a stranger's binary does.
