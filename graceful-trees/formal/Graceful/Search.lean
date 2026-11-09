import Graceful.Basic

/-!
Necessary conditions used by the bounded witness search. These prove the local
capacity rule and the injectivity of its packed boundary fields. They do not
formalize rooted-tree recognition, the memo table, or the Python implementation.
-/
namespace Graceful

/-- The only possible endpoints at a prescribed absolute difference. The Python
filter computes this relation on unused labels with two integer-bitset shifts;
bitset representation and mutable frontier invariants are not formalized. -/
theorem remaining_edge_endpoints (parent value difference : Nat) :
    distance parent value = difference ↔
      value = parent + difference ∨ parent = value + difference := by
  simp only [distance]
  omega

theorem remaining_edge_window (parent value limit : Nat)
    (h : distance parent value ≤ limit) :
    parent - limit ≤ value ∧ value ≤ parent + limit := by
  simp only [distance] at h
  omega

theorem distinct_subset_length (xs ys : List Nat) (hxs : xs.Nodup)
    (hsub : ∀ x, x ∈ xs → x ∈ ys) : xs.length ≤ ys.length := by
  induction xs generalizing ys with
  | nil => simp
  | cons x xs ih =>
    have hx := (List.nodup_cons.mp hxs).1
    have hn := (List.nodup_cons.mp hxs).2
    have hm : x ∈ ys := hsub x (by simp)
    have hs : ∀ y, y ∈ xs → y ∈ ys.erase x := by
      intro y hy
      have hne : y ≠ x := by
        intro he
        exact hx (he ▸ hy)
      exact (List.mem_erase_of_ne hne).mpr (hsub y (by simp [hy]))
    have bound := ih (ys.erase x) hn hs
    have erased := List.length_erase_of_mem hm
    have positive := List.length_pos_of_mem hm
    simp only [List.length_cons]
    omega

/-- Distinct child labels must fit in the still-unused interval around their
parent. If this interval has fewer entries than children, completion is impossible. -/
theorem remaining_child_capacity (children available : List Nat) (parent limit : Nat)
    (distinct : children.Nodup)
    (unused : ∀ x, x ∈ children → x ∈ available)
    (bounded : ∀ x, x ∈ children → distance parent x ≤ limit) :
    children.length ≤
      (available.filter fun x => decide (parent - limit ≤ x ∧ x ≤ parent + limit)).length := by
  apply distinct_subset_length children _ distinct
  intro x hx
  simp only [List.mem_filter, decide_eq_true_eq]
  exact ⟨unused x hx, remaining_edge_window parent x limit (bounded x hx)⟩

/-- Exact packing of a parent label and a rooted-subtree type ID; no hash-only
equivalence is assumed. The Python search generates at most 4*256 type IDs. -/
theorem boundary_fields_injective (p q a b : Nat)
    (ha : a < 65536) (hb : b < 65536)
    (h : 65536 * p + a = 65536 * q + b) : p = q ∧ a = b := by
  omega

end Graceful
