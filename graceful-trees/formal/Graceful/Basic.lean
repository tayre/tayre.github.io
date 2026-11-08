import Std

/-!
For a tree with m edges there are m+1 vertices. Fin (m+1) enforces the label
domain. These definitions apply to any edge list: treehood is a separate
precondition, checked by the Python verifier, not assumed or certified here.
-/
namespace Graceful

abbrev Vertex (m : Nat) := Fin (m + 1)
abbrev Edge (m : Nat) := Vertex m × Vertex m
abbrev Labeling (m : Nat) := Vertex m → Vertex m

/-- Absolute difference of natural numbers, with no truncated-subtraction ambiguity. -/
def distance (a b : Nat) : Nat := (a - b) + (b - a)

def requiredDifferences (m : Nat) : List Nat := (List.range m).map Nat.succ

def differences (edges : List (Edge m)) (f : Labeling m) : List Nat :=
  edges.map fun e => distance (f e.1).val (f e.2).val

def Bijective (f : Labeling m) : Prop :=
  (∀ u v, f u = f v → u = v) ∧ ∀ label, ∃ v, f v = label

/-- Exact graceful-labeling criterion, conditional on the supplied edge list. -/
def IsGraceful (edges : List (Edge m)) (f : Labeling m) : Prop :=
  Bijective f ∧ (differences edges f).Perm (requiredDifferences m)

end Graceful
