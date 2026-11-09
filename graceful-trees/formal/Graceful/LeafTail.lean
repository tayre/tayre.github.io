import Graceful.Basic

/-!
Arithmetic and allocation lemmas for residual leaves at two already labeled
parents. The quota theorem is an exact criterion *conditional on* decomposition
into forced choices, independent reflected pairs, and at most one midpoint.
Recognition and completeness of that graph decomposition, and the Python program,
are not formalized in this module.
-/
namespace Graceful.LeafTail

/-- For two distinct parents, equal distances identify the unique midpoint. -/
theorem midpoint_iff (p q u : Nat) (hpq : p < q) :
    distance u p = distance u q ↔ 2 * u = p + q := by
  simp only [distance]
  omega

theorem midpoint_unique (p q u v : Nat) (hpq : p < q)
    (hu : distance u p = distance u q) (hv : distance v p = distance v q) :
    u = v := by
  have hm := (midpoint_iff p q u hpq).mp hu
  have hn := (midpoint_iff p q v hpq).mp hv
  omega

/-- Reflection about the midpoint interchanges the parent differences. -/
theorem reflected_differences (p q u v : Nat) (hreflect : u + v = p + q) :
    distance u p = distance v q ∧ distance v p = distance u q := by
  simp only [distance]
  omega

/-- The converse identifies exactly the labels that form a swapped-choice pair. -/
theorem swapped_differences_reflect (p q u v : Nat) (hpq : p < q)
    (hleft : distance u p = distance v q)
    (hright : distance v p = distance u q) : u + v = p + q := by
  simp only [distance] at hleft hright
  omega

/-- Distances to two distinct parents determine the label uniquely. Combined
with reflection, this bounds a parallel candidate edge to at most two labels. -/
theorem two_distances_injective (p q u v : Nat) (hpq : p < q)
    (hleft : distance u p = distance v p)
    (hright : distance u q = distance v q) : u = v := by
  simp only [distance] at hleft hright
  omega

/-- A distinct reflected pair has distinct differences, and moving the pair
together from one parent to the other preserves the two consumed differences. -/
theorem reflected_pair_resources (p q u v : Nat) (hpq : p < q)
    (hreflect : u + v = p + q) (huv : u ≠ v) :
    distance u p ≠ distance v p ∧
      [distance u p, distance v p].Perm [distance u q, distance v q] := by
  have swap := reflected_differences p q u v hreflect
  constructor
  · simp only [distance]
    omega
  · rw [swap.1, swap.2]
    exact List.Perm.swap _ _ []

/-- Every two-parent candidate edge has the folded-path arithmetic used by the
choice graph. The alternatives allow either orientation of its endpoints. -/
theorem candidate_difference_shape (p q u : Nat) (hpq : p < q) :
    distance u q = distance u p + (q - p) ∨
    distance u p = distance u q + (q - p) ∨
    distance u p + distance u q = q - p := by
  simp only [distance]
  omega

/-- A maximum vertex in the positive candidate-difference graph cannot have
two distinct lower neighbors. This is the arithmetic step behind the written
maximum-vertex argument excluding longer simple cycles; graphs are not modeled. -/
theorem lower_candidate_neighbor_unique (delta maximum a b : Nat)
    (ha : 0 < a) (hb : 0 < b)
    (ham : a < maximum) (hbm : b < maximum)
    (hea : distance maximum a = delta ∨ maximum + a = delta)
    (heb : distance maximum b = delta ∨ maximum + b = delta) : a = b := by
  simp only [distance] at hea heb
  omega

/-- A true choice sends a reflected pair to the first parent (two leaves);
a false choice sends it to the second parent (zero leaves at the first). -/
def pairContribution : List Bool → Nat
  | [] => 0
  | b :: bs => (if b then 2 else 0) + pairContribution bs

theorem pair_contribution_append (xs ys : List Bool) :
    pairContribution (xs ++ ys) = pairContribution xs + pairContribution ys := by
  induction xs with
  | nil => simp [pairContribution]
  | cons b xs ih => simp only [List.cons_append, pairContribution, ih]; omega

theorem pair_contribution_true (n : Nat) :
    pairContribution (List.replicate n true) = 2 * n := by
  induction n with
  | zero => simp [pairContribution]
  | succ n ih =>
    simp only [List.replicate_succ, pairContribution, ↓reduceIte, ih]
    omega

theorem pair_contribution_false (n : Nat) :
    pairContribution (List.replicate n false) = 0 := by
  induction n with
  | zero => simp [pairContribution]
  | succ n ih => simp [List.replicate_succ, pairContribution, ih]

theorem pair_contribution_bounds (bs : List Bool) :
    pairContribution bs ≤ 2 * bs.length ∧ pairContribution bs % 2 = 0 := by
  induction bs with
  | nil => simp [pairContribution]
  | cons b bs ih =>
    cases b <;> simp only [pairContribution, Bool.false_eq_true, ↓reduceIte,
      List.length_cons] <;> omega

/-- Every even count up to twice the number of pairs is realized by an explicit
finite assignment of the pairs; there are no missing intermediate even counts. -/
theorem pair_choices_exact (pairs quota : Nat) :
    (∃ bs : List Bool, bs.length = pairs ∧ pairContribution bs = quota) ↔
      quota ≤ 2 * pairs ∧ quota % 2 = 0 := by
  constructor
  · rintro ⟨bs, hlen, hquota⟩
    simpa [hlen, hquota] using pair_contribution_bounds bs
  · intro h
    refine ⟨List.replicate (quota / 2) true ++
      List.replicate (pairs - quota / 2) false, ?_, ?_⟩
    · simp only [List.length_append, List.length_replicate]
      omega
    · rw [pair_contribution_append, pair_contribution_true, pair_contribution_false]
      omega

/-- An actual allocation of the independent pair choices and optional midpoint.
`forced` is the number already forced to the first parent by graph peeling. -/
def QuotaRealized (forced pairs midpoint quota : Nat) : Prop :=
  ∃ (bs : List Bool) (h : Nat), bs.length = pairs ∧ h ≤ midpoint ∧
    quota = forced + pairContribution bs + h

/-- Exact interval/parity completion criterion for the decomposed problem.
The reverse direction constructs pair choices, rather than assuming them. -/
theorem quota_criterion (forced pairs midpoint quota : Nat) (hm : midpoint ≤ 1) :
    QuotaRealized forced pairs midpoint quota ↔
      forced ≤ quota ∧ quota ≤ forced + 2 * pairs + midpoint ∧
        (midpoint = 1 ∨ (quota - forced) % 2 = 0) := by
  constructor
  · rintro ⟨bs, h, hlen, hmid, hquota⟩
    have hb := pair_contribution_bounds bs
    rw [hlen] at hb
    omega
  · rintro ⟨hlow, hhigh, hpar⟩
    let h := (quota - forced) % 2
    have hh : h ≤ midpoint := by dsimp [h]; omega
    have hbound : quota - forced - h ≤ 2 * pairs := by dsimp [h]; omega
    have heven : (quota - forced - h) % 2 = 0 := by dsimp [h]; omega
    obtain ⟨bs, hlen, hsum⟩ :=
      (pair_choices_exact pairs (quota - forced - h)).mpr ⟨hbound, heven⟩
    refine ⟨bs, h, hlen, hh, ?_⟩
    dsimp [h] at hsum ⊢
    omega

/-- Arithmetic specialization for an extreme central edge of a double-star:
the reflected-label decomposition can allocate `a` of its `a+b` leaves exactly
when the two leaf counts are not both odd. Graph coverage of the reflected
decomposition is still a separate obligation, not a theorem about whole trees. -/
theorem extreme_pair_quota (a b : Nat) :
    QuotaRealized 0 ((a + b) / 2) ((a + b) % 2) a ↔
      a % 2 = 0 ∨ b % 2 = 0 := by
  rw [quota_criterion 0 ((a + b) / 2) ((a + b) % 2) a (by omega)]
  omega

end Graceful.LeafTail
