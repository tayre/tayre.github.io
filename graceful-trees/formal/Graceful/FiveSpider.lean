import Graceful.Basic

/-!
Universal verification of two equal-five-edge-leg spider constructions.
Legs are numbered `i < k` and positions/edge kinds `j < 5`. The hub has label 1.
For every positive k, the actual vertex-label and adjacent-edge-difference lists
are proved permutations of the required intervals. The second construction also
certifies complementary vertex coverage and preservation of every difference.

This is an exact-list certificate, not an abstract-graph `IsGraceful` wrapper.
Graph recognition/treehood and Rofa's other four zero-position orbits are not
formalized here. No finite bound on k is used.
-/
namespace Graceful.FiveSpider

def a (k i : Nat) : Nat := if i = 0 then 5 * k else 5 * (k - i) + 1
def b (_k i : Nat) : Nat := 5 * i
def c (k i : Nat) : Nat := 5 * (k - 1 - i) + 3
def d (_k i : Nat) : Nat := 5 * i + 4
def e (k i : Nat) : Nat := 5 * (k - 1 - i) + 2

def label (k i j : Nat) : Nat :=
  if j = 0 then a k i else if j = 1 then b k i else
  if j = 2 then c k i else if j = 3 then d k i else e k i

def weight (k i j : Nat) : Nat :=
  if j = 0 then distance 1 (a k i) else
  if j = 1 then distance (a k i) (b k i) else
  if j = 2 then distance (b k i) (c k i) else
  if j = 3 then distance (c k i) (d k i) else
  distance (d k i) (e k i)

set_option maxRecDepth 100000
set_option maxHeartbeats 0

theorem label_bounded (k i j : Nat) (hi : i < k) (hj : j < 5) :
    label k i j ≤ 5 * k ∧ label k i j ≠ 1 := by
  have cases : j = 0 ∨ j = 1 ∨ j = 2 ∨ j = 3 ∨ j = 4 := by omega
  rcases cases with h | h | h | h | h <;> subst j <;>
    simp [label, a, b, c, d, e] <;> (try split) <;> omega

theorem label_injective (k i j i' j' : Nat)
    (hi : i < k) (hi' : i' < k) (hj : j < 5) (hj' : j' < 5)
    (h : label k i j = label k i' j') : i = i' ∧ j = j' := by
  have jc : j = 0 ∨ j = 1 ∨ j = 2 ∨ j = 3 ∨ j = 4 := by omega
  have jc' : j' = 0 ∨ j' = 1 ∨ j' = 2 ∨ j' = 3 ∨ j' = 4 := by omega
  rcases jc with hj0 | hj0 | hj0 | hj0 | hj0 <;> subst j
  all_goals rcases jc' with hj1 | hj1 | hj1 | hj1 | hj1 <;> subst j'
  all_goals simp [label, a, b, c, d, e] at h ⊢
  all_goals (try split at h) <;> (try split at h) <;> omega

theorem weight_bounded (k i j : Nat) (hi : i < k) (hj : j < 5) :
    0 < weight k i j ∧ weight k i j ≤ 5 * k := by
  have cases : j = 0 ∨ j = 1 ∨ j = 2 ∨ j = 3 ∨ j = 4 := by omega
  rcases cases with h | h | h | h | h <;> subst j
  all_goals simp [weight, a, b, c, d, e, distance]
  all_goals (try split) <;> omega

theorem weight_injective (k i j i' j' : Nat)
    (hi : i < k) (hi' : i' < k) (hj : j < 5) (hj' : j' < 5)
    (h : weight k i j = weight k i' j') : i = i' ∧ j = j' := by
  have jc : j = 0 ∨ j = 1 ∨ j = 2 ∨ j = 3 ∨ j = 4 := by omega
  have jc' : j' = 0 ∨ j' = 1 ∨ j' = 2 ∨ j' = 3 ∨ j' = 4 := by omega
  rcases jc with hj0 | hj0 | hj0 | hj0 | hj0 <;> subst j
  all_goals rcases jc' with hj1 | hj1 | hj1 | hj1 | hj1 <;> subst j'
  all_goals simp [weight, a, b, c, d, e, distance] at h ⊢
  all_goals (try split at h) <;> (try split at h) <;> omega

theorem designated_zero (k : Nat) : label k 0 1 = 0 := by
  simp [label, b]

private theorem nodup_map_on (xs : List Nat) (f : Nat → Nat) (hn : xs.Nodup)
    (hf : ∀ x ∈ xs, ∀ y ∈ xs, f x = f y → x = y) : (xs.map f).Nodup := by
  induction xs with
  | nil => simp
  | cons x xs ih =>
    obtain ⟨hx, ht⟩ := List.nodup_cons.mp hn
    apply List.nodup_cons.mpr
    constructor
    · intro hm
      obtain ⟨y, hy, he⟩ := List.mem_map.mp hm
      have eq := hf x (by simp) y (by simp [hy]) he.symm
      exact hx (eq ▸ hy)
    · apply ih ht
      intro u hu v hv he
      exact hf u (by simp [hu]) v (by simp [hv]) he

private theorem perm_of_nodup_subset_length (xs ys : List Nat)
    (hn : xs.Nodup) (hs : ∀ x ∈ xs, x ∈ ys)
    (hl : xs.length = ys.length) : xs.Perm ys := by
  induction xs generalizing ys with
  | nil =>
    have hy : ys = [] := List.length_eq_zero_iff.mp (by simpa using hl.symm)
    subst ys
    exact List.Perm.refl []
  | cons x xs ih =>
    obtain ⟨hx, ht⟩ := List.nodup_cons.mp hn
    have hm : x ∈ ys := hs x (by simp)
    have he := List.length_erase_of_mem hm
    have hp := List.length_pos_of_mem hm
    have htlen : xs.length = (ys.erase x).length := by simp only [List.length_cons] at hl; omega
    have htperm := ih (ys.erase x) ht (by
      intro y hy
      apply (List.mem_erase_of_ne (by intro h; exact hx (h ▸ hy))).mpr
      exact hs y (by simp [hy])) htlen
    exact (List.Perm.cons x htperm).trans (List.perm_cons_erase hm).symm

/-- Generic finite coverage argument: an injective bounded list of the correct
size is a permutation of the target interval. -/
theorem indexed_coverage (k : Nat) (f : Nat → Nat → Nat)
    (bound : ∀ i < k, ∀ j < 5, 0 < f i j ∧ f i j ≤ 5 * k)
    (inj : ∀ i < k, ∀ j < 5, ∀ i' < k, ∀ j' < 5,
      f i j = f i' j' → i = i' ∧ j = j') :
    ((List.range (5 * k)).map fun q => f (q / 5) (q % 5)).Perm
      (requiredDifferences (5 * k)) := by
  apply perm_of_nodup_subset_length
  · apply nodup_map_on _ _ List.nodup_range
    intro q hq r hr he
    have hq' := List.mem_range.mp hq
    have hr' := List.mem_range.mp hr
    have h := inj (q / 5) (by omega) (q % 5) (by omega)
      (r / 5) (by omega) (r % 5) (by omega) he
    omega
  · intro x hx
    obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hx
    have hq' := List.mem_range.mp hq
    have hb := bound (q / 5) (by omega) (q % 5) (by omega)
    apply List.mem_map.mpr
    refine ⟨f (q / 5) (q % 5) - 1, List.mem_range.mpr (by omega), ?_⟩
    omega
  · simp [requiredDifferences]

def vertexLabels (k : Nat) : List Nat :=
  1 :: (List.range (5 * k)).map fun q => label k (q / 5) (q % 5)

def edgeWeights (k : Nat) : List Nat :=
  (List.range (5 * k)).map fun q => weight k (q / 5) (q % 5)

theorem vertexLabels_complete (k : Nat) (hk : 0 < k) :
    (vertexLabels k).Perm (List.range (5 * k + 1)) := by
  apply perm_of_nodup_subset_length
  · apply List.nodup_cons.mpr
    constructor
    · intro hm
      obtain ⟨q, hq, he⟩ := List.mem_map.mp hm
      have hq' := List.mem_range.mp hq
      exact (label_bounded k (q / 5) (q % 5) (by omega) (by omega)).2 he
    · apply nodup_map_on _ _ List.nodup_range
      intro q hq r hr he
      have hq' := List.mem_range.mp hq
      have hr' := List.mem_range.mp hr
      have h := label_injective k (q / 5) (q % 5) (r / 5) (r % 5)
        (by omega) (by omega) (by omega) (by omega) he
      omega
  · intro x hx
    rcases List.mem_cons.mp hx with rfl | hx
    · exact List.mem_range.mpr (by omega)
    · obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hx
      have hq' := List.mem_range.mp hq
      have hb := label_bounded k (q / 5) (q % 5) (by omega) (by omega)
      exact List.mem_range.mpr (by omega)
  · simp [vertexLabels]

theorem edgeWeights_complete (k : Nat) :
    (edgeWeights k).Perm (requiredDifferences (5 * k)) := by
  apply indexed_coverage
  · intro i hi j hj
    exact weight_bounded k i j hi hj
  · intro i hi j hj i' hi' j' hj' he
    exact weight_injective k i j i' j' hi hi' hj hj' he

theorem construction_certificate (k : Nat) (hk : 0 < k) :
    (vertexLabels k).Perm (List.range (5 * k + 1)) ∧
    (edgeWeights k).Perm (requiredDifferences (5 * k)) ∧
    label k 0 1 = 0 :=
  ⟨vertexLabels_complete k hk, edgeWeights_complete k, designated_zero k⟩

/-! A second construction places 0 and 5k at adjacent interior positions.
Complementing its labels therefore realizes the other interior zero orbit. -/
namespace TwoInterior

def a (k i : Nat) : Nat :=
  if i = 0 then 5 * k - 1 else if i + 1 = k then 6 else 5 * (k - i) + 1
def b (k i : Nat) : Nat :=
  if i = 0 then 0 else if i + 1 = k then 5 * k - 2 else 5 * i + 4
def c (k i : Nat) : Nat :=
  if i = 0 then 5 * k else if i + 1 = k then 2 else 5 * (k - 1 - i)
def d (k i : Nat) : Nat :=
  if i = 0 then 3 else if i + 1 = k then 5 * k - 5 else 5 * i + 3
def e (k i : Nat) : Nat :=
  if i = 0 then 5 * k - 3 else if i + 1 = k then 4 else 5 * (k - 1 - i) + 2

def label (k i j : Nat) : Nat :=
  if j = 0 then a k i else if j = 1 then b k i else
  if j = 2 then c k i else if j = 3 then d k i else e k i

def weight (k i j : Nat) : Nat :=
  if j = 0 then distance 1 (a k i) else
  if j = 1 then distance (a k i) (b k i) else
  if j = 2 then distance (b k i) (c k i) else
  if j = 3 then distance (c k i) (d k i) else
  distance (d k i) (e k i)

theorem label_bounded (k i j : Nat) (hi : i < k) (hj : j < 5) :
    label k i j ≤ 5 * k ∧ label k i j ≠ 1 := by
  have jc : j = 0 ∨ j = 1 ∨ j = 2 ∨ j = 3 ∨ j = 4 := by omega
  rcases jc with h | h | h | h | h <;> subst j
  all_goals by_cases h0 : i = 0 <;> by_cases hlast : i + 1 = k
  all_goals simp [label, a, b, c, d, e, h0, hlast] <;> omega

theorem label_injective (k i j i' j' : Nat)
    (hi : i < k) (hi' : i' < k) (hj : j < 5) (hj' : j' < 5)
    (h : label k i j = label k i' j') : i = i' ∧ j = j' := by
  have jc : j = 0 ∨ j = 1 ∨ j = 2 ∨ j = 3 ∨ j = 4 := by omega
  have jc' : j' = 0 ∨ j' = 1 ∨ j' = 2 ∨ j' = 3 ∨ j' = 4 := by omega
  rcases jc with hj0 | hj0 | hj0 | hj0 | hj0 <;> subst j
  all_goals rcases jc' with hj1 | hj1 | hj1 | hj1 | hj1 <;> subst j'
  all_goals by_cases h0 : i = 0 <;> by_cases hlast : i + 1 = k
  all_goals by_cases h0' : i' = 0 <;> by_cases hlast' : i' + 1 = k
  all_goals simp [label, a, b, c, d, e, h0, hlast, h0', hlast'] at h ⊢ <;> omega

theorem weight_bounded (k i j : Nat) (hi : i < k) (hj : j < 5) :
    0 < weight k i j ∧ weight k i j ≤ 5 * k := by
  have jc : j = 0 ∨ j = 1 ∨ j = 2 ∨ j = 3 ∨ j = 4 := by omega
  rcases jc with h | h | h | h | h <;> subst j
  all_goals by_cases h0 : i = 0 <;> by_cases hlast : i + 1 = k
  all_goals simp [weight, a, b, c, d, e, distance, h0, hlast] <;> omega

theorem weight_injective (k i j i' j' : Nat)
    (hi : i < k) (hi' : i' < k) (hj : j < 5) (hj' : j' < 5)
    (h : weight k i j = weight k i' j') : i = i' ∧ j = j' := by
  have jc : j = 0 ∨ j = 1 ∨ j = 2 ∨ j = 3 ∨ j = 4 := by omega
  have jc' : j' = 0 ∨ j' = 1 ∨ j' = 2 ∨ j' = 3 ∨ j' = 4 := by omega
  rcases jc with hj0 | hj0 | hj0 | hj0 | hj0 <;> subst j
  all_goals rcases jc' with hj1 | hj1 | hj1 | hj1 | hj1 <;> subst j'
  all_goals by_cases h0 : i = 0 <;> by_cases hlast : i + 1 = k
  all_goals by_cases h0' : i' = 0 <;> by_cases hlast' : i' + 1 = k
  all_goals simp [weight, a, b, c, d, e, distance, h0, hlast, h0', hlast'] at h ⊢ <;> omega

theorem interior_extremes (k : Nat) : label k 0 1 = 0 ∧ label k 0 2 = 5 * k := by
  simp [label, b, c]

def vertexLabels (k : Nat) : List Nat :=
  1 :: (List.range (5 * k)).map fun q => label k (q / 5) (q % 5)

def edgeWeights (k : Nat) : List Nat :=
  (List.range (5 * k)).map fun q => weight k (q / 5) (q % 5)

theorem vertexLabels_complete (k : Nat) (hk : 0 < k) :
    (vertexLabels k).Perm (List.range (5 * k + 1)) := by
  apply perm_of_nodup_subset_length
  · apply List.nodup_cons.mpr
    constructor
    · intro hm
      obtain ⟨q, hq, he⟩ := List.mem_map.mp hm
      have hq' := List.mem_range.mp hq
      exact (label_bounded k (q / 5) (q % 5) (by omega) (by omega)).2 he
    · apply nodup_map_on _ _ List.nodup_range
      intro q hq r hr he
      have hq' := List.mem_range.mp hq
      have hr' := List.mem_range.mp hr
      have h := label_injective k (q / 5) (q % 5) (r / 5) (r % 5)
        (by omega) (by omega) (by omega) (by omega) he
      omega
  · intro x hx
    rcases List.mem_cons.mp hx with rfl | hx
    · exact List.mem_range.mpr (by omega)
    · obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hx
      have hq' := List.mem_range.mp hq
      have hb := label_bounded k (q / 5) (q % 5) (by omega) (by omega)
      exact List.mem_range.mpr (by omega)
  · simp [vertexLabels]

theorem edgeWeights_complete (k : Nat) :
    (edgeWeights k).Perm (requiredDifferences (5 * k)) := by
  apply indexed_coverage
  · intro i hi j hj
    exact weight_bounded k i j hi hj
  · intro i hi j hj i' hi' j' hj' he
    exact weight_injective k i j i' j' hi hi' hj hj' he

theorem construction_certificate (k : Nat) (hk : 0 < k) :
    (vertexLabels k).Perm (List.range (5 * k + 1)) ∧
    (edgeWeights k).Perm (requiredDifferences (5 * k)) ∧
    label k 0 1 = 0 ∧ label k 0 2 = 5 * k :=
  ⟨vertexLabels_complete k hk, edgeWeights_complete k, interior_extremes k⟩

private theorem member_bounded (k : Nat) (hk : 0 < k) (x : Nat)
    (hx : x ∈ vertexLabels k) : x ≤ 5 * k := by
  have hm := (vertexLabels_complete k hk).mem_iff.mp hx
  have := List.mem_range.mp hm
  omega

/-- Complementation preserves all differences on the supplied vertex labels. -/
theorem complementary_distance (k : Nat) (hk : 0 < k) (x y : Nat)
    (hx : x ∈ vertexLabels k) (hy : y ∈ vertexLabels k) :
    distance (5 * k - x) (5 * k - y) = distance x y := by
  have := member_bounded k hk x hx
  have := member_bounded k hk y hy
  simp only [distance]
  omega

theorem complementary_vertexLabels_complete (k : Nat) (hk : 0 < k) :
    ((vertexLabels k).map fun x => 5 * k - x).Perm (List.range (5 * k + 1)) := by
  apply perm_of_nodup_subset_length
  · apply nodup_map_on
    · exact (vertexLabels_complete k hk).symm.nodup List.nodup_range
    · intro x hx y hy he
      have := member_bounded k hk x hx
      have := member_bounded k hk y hy
      omega
  · intro x hx
    obtain ⟨y, _, rfl⟩ := List.mem_map.mp hx
    exact List.mem_range.mpr (by omega)
  · simpa using (vertexLabels_complete k hk).length_eq

/-- Position index 2 is distance 3 from the hub. -/
theorem complementary_interior_zero (k : Nat) : 5 * k - label k 0 2 = 0 := by
  rw [(interior_extremes k).2]
  omega

end TwoInterior

end Graceful.FiveSpider
