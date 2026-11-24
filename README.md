# MirrorParity

[Stable Studionet contract](https://explorer-studio.genlayer.com/address/0xF35a2D9fA894A1AfaaB55deCA27701B3b8f77835) · [Deployment](https://explorer-studio.genlayer.com/tx/0x7cfc5e815ef0eb8f6c24549eb5d1f5a48849f6d47f44335ff85120c7eae7bc49)

Record whether multiple public distribution routes agree on the bytes of a
small, version-pinned npm file. Give the contract a package, version, top-level
filename and expected SHA-256 at deployment. Anyone may submit the next
checkpoint. Reports remain available by sequence number.

Validators each fetch from jsDelivr, UNPKG and esm.sh as needed. A node reports
a digest only when at least two routes return the same bounded, nonempty
payload. The GenLayer equivalence check compares the resulting digest or empty
quorum result. Nodes may reach the same digest through different routes. State
changes only after agreement. A majority digest matching the reference produces
MATCH. An alternative majority produces DRIFT. No byte majority produces
INCONCLUSIVE. Each successful checkpoint advances the sequence, preventing
replays against the same prior number.

| Method | Effect |
|---|---|
| `sample(previous)` | Append a checkpoint if the expected sequence is current. |
| `get_checkpoint(number)` | Inspect the majority digest and checkpoint status. |
| `get_policy()` | Read the fixed file pin, expected digest and latest sequence. |

The routes may share upstream infrastructure. Agreement measures observed byte
availability and consistency across routes. It does not establish publisher
identity, package safety or long-term availability. Clients should use the
latest finalized checkpoint and choose when to sample again.

## Example and verification

The [scenario](scenario.json) checks the LICENSE of is-number 7.0.0 and attempts
the same checkpoint twice. The initial expected digest is the SHA-256 of the
file. A consumer can read the resulting checkpoint without a wallet.

Use Node.js 24 and Stable Studionet, chain ID 61999
(`https://studio.genlayer.com/api`).

```sh
npm ci
python3 -B -m unittest discover -s tests -v
python3 -m pip install genvm-linter==0.11.0
genvm-lint check contracts/contract.py --json
npm run verify:live
```

The local tests use a stubbed VM and synthetic HTTP responses. The
[official lint result](evidence/genvm-lint.json) includes semantic validation
using the runner declared in the contract. The read-only verification command
checks [Studionet evidence](evidence/studionet.json) against the deployed source,
finalized receipts and latest finalized state. To deploy and run the scenario on
a fresh test account, use `STUDIONET_FAUCET=1 npm run deploy`. Use a separate
working copy when generating evidence for a different deployment.

[Initial deployment receipts](evidence/initial-deployment.json) document an earlier build.
The initial implementation referenced the wrong HTTP status field. Its missing-response handling classified the resulting observations as inconclusive. The replacement uses the SDK response status directly.
