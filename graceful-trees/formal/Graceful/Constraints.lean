import Graceful.Basic

namespace Graceful

theorem requiredDifferences_succ (m : Nat) :
    requiredDifferences (m + 1) = requiredDifferences m ++ [m + 1] := by
  simp [requiredDifferences, List.range_succ]

theorem twice_required_sum (m : Nat) :
    2 * (requiredDifferences m).sum = m * (m + 1) := by
  induction m with
  | zero => rfl
  | succ m ih =>
    rw [requiredDifferences_succ]
    simp only [List.sum_append_nat, List.sum_cons, List.sum_nil, Nat.add_zero,
      Nat.mul_add, Nat.add_mul, Nat.mul_one, Nat.one_mul] at *
    omega

/-- The redundant CP-SAT sum equation follows from the exact difference permutation. -/
theorem graceful_difference_sum {edges : List (Edge m)} {f : Labeling m}
    (h : IsGraceful edges f) :
    (differences edges f).sum = m * (m + 1) / 2 := by
  have hsum := h.2.sum_nat
  have htwice := twice_required_sum m
  omega

/-- The largest allowed difference must join the two extreme labels. -/
theorem extreme_endpoints (a b : Vertex m) :
    distance a.val b.val = m ↔
      (a.val = 0 ∧ b.val = m) ∨ (a.val = m ∧ b.val = 0) := by
  have := a.isLt
  have := b.isLt
  simp only [distance]
  omega

/-- Four distinct labels in 0..3 cannot put difference 3 on the middle
edge of a four-vertex path without repeating the two end-edge differences. -/
theorem path4_middle_repeats (a b c d : Fin 4)
    (hab : a ≠ b) (hac : a ≠ c) (had : a ≠ d)
    (hbd : b ≠ d) (hcd : c ≠ d)
    (hmiddle : distance b.val c.val = 3) :
    distance a.val b.val = distance c.val d.val := by
  have ha := a.isLt
  have hb := b.isLt
  have hc := c.isLt
  have hd := d.isLt
  have hab' : a.val ≠ b.val := fun h => hab (Fin.ext h)
  have hac' : a.val ≠ c.val := fun h => hac (Fin.ext h)
  have had' : a.val ≠ d.val := fun h => had (Fin.ext h)
  have hbd' : b.val ≠ d.val := fun h => hbd (Fin.ext h)
  have hcd' : c.val ≠ d.val := fun h => hcd (Fin.ext h)
  simp only [distance] at *
  omega

def path4Edges : List (Edge 3) := [(0, 1), (1, 2), (2, 3)]

/-- This is an actual impossibility theorem for the restricted four-vertex model,
not a trust of CP-SAT's INFEASIBLE status. -/
theorem path4_middle_not_graceful (f : Labeling 3)
    (hmiddle : distance (f 1).val (f 2).val = 3) :
    ¬ IsGraceful path4Edges f := by
  intro h
  have distinct (u v : Vertex 3) (huv : u ≠ v) : f u ≠ f v :=
    fun heq => huv (h.1.1 u v heq)
  have repeats := path4_middle_repeats (f 0) (f 1) (f 2) (f 3)
    (distinct 0 1 (by decide)) (distinct 0 2 (by decide))
    (distinct 0 3 (by decide)) (distinct 1 3 (by decide))
    (distinct 2 3 (by decide)) hmiddle
  have nodup : (differences path4Edges f).Nodup := h.2.nodup_iff.mpr (by decide)
  simp only [differences, path4Edges, List.map_cons, List.map_nil] at nodup
  rw [repeats] at nodup
  simp at nodup

def path4Labeling (v : Vertex 3) : Vertex 3 :=
  match v.val with
  | 0 => 0
  | 1 => 3
  | 2 => 1
  | _ => 2

/-- The same path is graceful without the middle-edge restriction. -/
theorem path4_graceful : IsGraceful path4Edges path4Labeling := by
  constructor
  · constructor <;> decide
  · decide

end Graceful
