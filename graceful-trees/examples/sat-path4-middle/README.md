# Restricted negative control

Tree: path `0–1–2–3`. Restriction: edge `[1,2]` must carry difference 3.
That placement is impossible; the unrestricted path is graceful, for example
with labels `[0,3,1,2]`. This is a validation example, not a counterexample or a
novel result. A separate [Lean theorem](../../formal/Graceful/Constraints.lean)
proves the same restricted impossibility.

Glucose 4.1 through `python-sat==1.8.dev24` produced the saved refutation.
The standard-library checker accepted all seven additions. DRAT-trim commit
`2e3b2dc0ecf938addbd779d42877b6ed69d9a985` also returned `s VERIFIED` in DRUP mode.
The 25-variable, 99-clause CNF hash is
`ee5234a19308a3dcd3d2f2ecbda0d4b6b8e5bb43fc028e0a81ae7ff5ee5fbd8e`.

From `graceful-trees/`:

```sh
python3 -S src/graceful_research/proof_verify.py \
  examples/sat-path4-middle/unsat-certificate.json
graceful-research replay examples/sat-path4-middle/request.json \
  --output results/path4-replay
# Optional, using a separately built DRAT-trim:
drat-trim examples/sat-path4-middle/model.cnf examples/sat-path4-middle/proof.drup -u
```

See [the encoding specification](../../docs/sat-certificates.md) for the scope and
trusted components. `verification.json` is a saved result, not a substitute for
rerunning the checker.
