import Graceful.Basic

/-!
A concrete obstruction from the bounded rooted-pairing experiment. This concerns
three fixed two-vertex branches, their already assigned parent labels, and a
prescribed partition of remaining differences into internal and attachment roles.
It does not refute gracefulness of any whole tree or completion with another split.
-/
namespace Graceful.RootedPairing

/-- Branches are `0--x0--y0`, `9--x1--y1`, and `9--x2--y2`.
The first permutation gives exactly the six unused labels, with no repetitions.
The other two permutations require exactly the internal and attachment resources,
separately. Parent labels 0 and 9 are excluded from the unused-label resource list.
-/
def Case56Completion (x0 y0 x1 y1 x2 y2 : Nat) : Prop :=
  [x0, y0, x1, y1, x2, y2].Perm [1, 4, 5, 6, 7, 8] ∧
  [distance x0 y0, distance x1 y1, distance x2 y2].Perm [1, 4, 6] ∧
  [distance 0 x0, distance 9 x1, distance 9 x2].Perm [2, 3, 5]

private theorem zero_root (x : Nat) (hx : x ∈ [1, 4, 5, 6, 7, 8])
    (ha : distance 0 x ∈ [2, 3, 5]) : x = 5 := by
  simp only [List.mem_cons, List.not_mem_nil, or_false, distance] at hx ha
  omega

private theorem nine_root (x : Nat) (hx : x ∈ [1, 4, 5, 6, 7, 8])
    (ha : distance 9 x ∈ [2, 3, 5]) (hne : distance 9 x ≠ 5) :
    x = 6 ∨ x = 7 := by
  simp only [List.mem_cons, List.not_mem_nil, or_false, distance] at hx ha hne
  omega

private theorem six_internal_impossible (y : Nat) (hy : y ∈ [1, 4, 5, 6, 7, 8])
    (h5 : y ≠ 5) (h6 : y ≠ 6) (h7 : y ≠ 7)
    (hi : distance 6 y ∈ [1, 4, 6]) : False := by
  simp only [List.mem_cons, List.not_mem_nil, or_false, distance] at hy hi
  omega

/-- Despite every local resource having some available branch option, these
three branches cannot consume the exact resources together. This is a fixed
residual impossibility theorem, not a general classification or novelty claim.
-/
theorem case56_no_completion (x0 y0 x1 y1 x2 y2 : Nat) :
    ¬ Case56Completion x0 y0 x1 y1 x2 y2 := by
  rintro ⟨hlabels, hinternal, hattachment⟩
  have label_member (v : Nat) (hv : v ∈ [x0, y0, x1, y1, x2, y2]) :
      v ∈ [1, 4, 5, 6, 7, 8] := hlabels.mem_iff.mp hv
  have hx0 := label_member x0 (by simp)
  have hx1 := label_member x1 (by simp)
  have hx2 := label_member x2 (by simp)
  have hy1 := label_member y1 (by simp)
  have hy2 := label_member y2 (by simp)
  have distinct : [x0, y0, x1, y1, x2, y2].Nodup :=
    hlabels.nodup_iff.mpr (by decide)
  have a0 := hattachment.mem_iff.mp
    (show distance 0 x0 ∈ [distance 0 x0, distance 9 x1, distance 9 x2] by simp)
  have a1 := hattachment.mem_iff.mp
    (show distance 9 x1 ∈ [distance 0 x0, distance 9 x1, distance 9 x2] by simp)
  have a2 := hattachment.mem_iff.mp
    (show distance 9 x2 ∈ [distance 0 x0, distance 9 x1, distance 9 x2] by simp)
  have attachment_distinct :
      [distance 0 x0, distance 9 x1, distance 9 x2].Nodup :=
    hattachment.nodup_iff.mpr (by decide)
  have root0 := zero_root x0 hx0 a0
  subst x0
  have a1_ne : distance 9 x1 ≠ 5 := by
    intro h
    rw [h] at attachment_distinct
    simp [distance] at attachment_distinct
  have a2_ne : distance 9 x2 ≠ 5 := by
    intro h
    rw [h] at attachment_distinct
    simp [distance] at attachment_distinct
  have root1 := nine_root x1 hx1 a1 a1_ne
  have root2 := nine_root x2 hx2 a2 a2_ne
  have i1 := hinternal.mem_iff.mp
    (show distance x1 y1 ∈ [distance 5 y0, distance x1 y1, distance x2 y2] by simp)
  have i2 := hinternal.mem_iff.mp
    (show distance x2 y2 ∈ [distance 5 y0, distance x1 y1, distance x2 y2] by simp)
  rcases root1 with root1 | root1
  · subst x1
    rcases root2 with root2 | root2
    · subst x2
      simp at distinct
    · subst x2
      apply six_internal_impossible y1 hy1 _ _ _ i1
      · intro h; subst y1; simp at distinct
      · intro h; subst y1; simp at distinct
      · intro h; subst y1; simp at distinct
  · subst x1
    rcases root2 with root2 | root2
    · subst x2
      apply six_internal_impossible y2 hy2 _ _ _ i2
      · intro h; subst y2; simp at distinct
      · intro h; subst y2; simp at distinct
      · intro h; subst y2; simp at distinct
    · subst x2
      simp at distinct

end Graceful.RootedPairing
