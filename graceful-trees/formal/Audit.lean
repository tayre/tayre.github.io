import Graceful
import Lean.Elab.Command
import Lean.Util.CollectAxioms

open Lean Elab Command

/- Check the transitive axiom dependencies of every project declaration, not
just a hand-picked theorem list. Computation admitted by extra axioms is rejected.
The accepted axioms are Lean's standard logical foundations. -/
run_cmd do
  let env ← getEnv
  let allowed : Array Name := #[``propext, ``Classical.choice, ``Quot.sound]
  let names := env.constants.toList.filterMap fun (name, _) =>
    if (env.getModuleIdxFor? name).any
        (fun idx => (env.header.modules[idx]?).any
          (fun entry => (`Graceful).isPrefixOf entry.module)) then
      some name
    else none
  let required : Array Name := #[``Graceful.oriented_witness,
    ``Graceful.complement_graceful, ``Graceful.graceful_difference_sum,
    ``Graceful.extreme_endpoints, ``Graceful.path4_middle_not_graceful,
    ``Graceful.path4_graceful, ``Graceful.caterpillar_low_step,
    ``Graceful.caterpillar_high_step, ``Graceful.caterpillar_low_transition,
    ``Graceful.caterpillar_high_transition]
  for name in required do
    unless names.contains name do
      throwError "Required theorem missing from audit: {name}"
  let mut theoremCount := 0
  for name in names.mergeSort (fun a b => a.toString ≤ b.toString) do
    let axioms ← collectAxioms name
    for axiomName in axioms do
      unless allowed.contains axiomName do
        throwError "Disallowed axiom {axiomName} in {name}"
    if getOriginalConstKind? env name == some .thm then
      theoremCount := theoremCount + 1
      logInfo m!"CHECKED {name}: {axioms.toList}"
  if theoremCount < 1 then
    throwError "No project theorems found"
  logInfo m!"AXIOM_AUDIT_OK declarations={names.length} theorems={theoremCount}"
