import Graceful.Constraints

/-! One-sided completeness of the one-hot clause schema: every graceful labeling
gives a satisfying assignment. This is the direction needed to interpret UNSAT.
The Python serializer and the DRUP checker are not extracted from these proofs. -/
namespace Graceful.SAT

inductive Var (m k : Nat) where
  | x (vertex label : Vertex m)
  | y (edge : Fin k) (difference : Nat)

abbrev Literal (m k : Nat) := Var m k × Bool
abbrev Clause (m k : Nat) := List (Literal m k)

def Satisfied (assignment : Var m k → Prop) (clause : Clause m k) : Prop :=
  ∃ literal ∈ clause, if literal.2 then assignment literal.1 else ¬ assignment literal.1

def witness (edges : List (Edge m)) (f : Labeling m) : Var m edges.length → Prop
  | .x v a => f v = a
  | .y e d => distance (f (edges.get e).1).val (f (edges.get e).2).val = d

/-- Every possible production clause belongs to one of these six rules.
The y-difference rule is sound even without restricting d to 1..m. -/
inductive Admissible (edges : List (Edge m)) (restriction : Option (Edge m)) :
    Clause m edges.length → Prop where
  | total (v : Vertex m) : Admissible edges restriction
      (List.ofFn fun a : Vertex m => (Var.x v a, true))
  | single (v a b : Vertex m) (hne : a ≠ b) : Admissible edges restriction
      [(.x v a, false), (.x v b, false)]
  | injective (u v a : Vertex m) (hne : u ≠ v) : Admissible edges restriction
      [(.x u a, false), (.x v a, false)]
  | difference (e : Fin edges.length) (a b : Vertex m) : Admissible edges restriction
      [(.x (edges.get e).1 a, false), (.x (edges.get e).2 b, false),
       (.y e (distance a.val b.val), true)]
  | uniqueDifference (e f : Fin edges.length) (d : Nat) (hne : e ≠ f) :
      Admissible edges restriction [(.y e d, false), (.y f d, false)]
  | extreme (e : Edge m) (v : Vertex m) (hr : restriction = some e)
      (hv : v = e.1 ∨ v = e.2) : Admissible edges restriction
      [(.x v 0, true), (.x v ⟨m, by omega⟩, true)]

def Respects (restriction : Option (Edge m)) (f : Labeling m) : Prop :=
  ∀ e, restriction = some e → distance (f e.1).val (f e.2).val = m

theorem differences_nodup {edges : List (Edge m)} {f : Labeling m}
    (h : IsGraceful edges f) : (differences edges f).Nodup := by
  apply h.2.nodup_iff.mpr
  unfold requiredDifferences List.Nodup
  rw [List.pairwise_map]
  exact List.nodup_range.imp (fun hab heq => hab (Nat.succ.inj heq))

theorem distinct_edge_differences {edges : List (Edge m)} {f : Labeling m}
    (h : IsGraceful edges f) (i j : Fin edges.length) (hne : i ≠ j) :
    distance (f (edges.get i).1).val (f (edges.get i).2).val ≠
      distance (f (edges.get j).1).val (f (edges.get j).2).val := by
  intro heq
  apply hne
  apply Fin.ext
  apply List.getElem?_inj (xs := differences edges f)
  · simp [differences]
  · exact differences_nodup h
  · simpa [differences, List.getElem?_eq_getElem, i.isLt, j.isLt] using congrArg some heq

theorem witness_satisfies_clause {edges : List (Edge m)} {f : Labeling m}
    {restriction : Option (Edge m)} {clause : Clause m edges.length}
    (h : IsGraceful edges f) (hr : Respects restriction f)
    (hc : Admissible edges restriction clause) : Satisfied (witness edges f) clause := by
  classical
  cases hc with
  | total v =>
    refine ⟨(.x v (f v), true), ?_, rfl⟩
    exact List.mem_ofFn.mpr ⟨f v, rfl⟩
  | single v a b hne =>
    simp only [Satisfied, List.mem_cons, List.not_mem_nil, or_false, exists_eq_or_imp, exists_eq_left,
      witness, Bool.false_eq_true, ↓reduceIte]
    by_cases ha : f v = a
    · exact Or.inr (fun hb => hne (ha.symm.trans hb))
    · exact Or.inl ha
  | injective u v a hne =>
    simp only [Satisfied, List.mem_cons, List.not_mem_nil, or_false, exists_eq_or_imp, exists_eq_left,
      witness, Bool.false_eq_true, ↓reduceIte]
    by_cases hu : f u = a
    · exact Or.inr (fun hv => hne (h.1.1 u v (hu.trans hv.symm)))
    · exact Or.inl hu
  | difference e a b =>
    simp only [Satisfied, List.mem_cons, List.not_mem_nil, or_false, exists_eq_or_imp, exists_eq_left,
      witness, Bool.false_eq_true, ↓reduceIte]
    by_cases ha : f (edges.get e).1 = a
    · by_cases hb : f (edges.get e).2 = b
      · exact Or.inr (Or.inr (by rw [ha, hb]))
      · exact Or.inr (Or.inl hb)
    · exact Or.inl ha
  | uniqueDifference i j d hne =>
    simp only [Satisfied, List.mem_cons, List.not_mem_nil, or_false, exists_eq_or_imp, exists_eq_left,
      witness, Bool.false_eq_true, ↓reduceIte]
    by_cases hi : distance (f (edges.get i).1).val (f (edges.get i).2).val = d
    · exact Or.inr (fun hj => distinct_edge_differences h i j hne (hi.trans hj.symm))
    · exact Or.inl hi
  | extreme e v he hv =>
    have endpoints := (extreme_endpoints (f e.1) (f e.2)).mp (hr e he)
    simp only [Satisfied, List.mem_cons, List.not_mem_nil, or_false, exists_eq_or_imp, exists_eq_left,
      witness, ↓reduceIte]
    rcases hv with rfl | rfl <;> rcases endpoints with hp | hp
    · exact Or.inl (Fin.ext hp.1)
    · exact Or.inr (Fin.ext hp.1)
    · exact Or.inr (Fin.ext hp.2)
    · exact Or.inl (Fin.ext hp.2)

/-- A refutation of clauses from this schema excludes a graceful labeling
respecting the same restriction. It does not remove that restriction. -/
theorem unsat_excludes_graceful {edges : List (Edge m)}
    {restriction : Option (Edge m)} (cnf : List (Clause m edges.length))
    (hc : ∀ c ∈ cnf, Admissible edges restriction c)
    (unsat : ¬ ∃ assignment, ∀ c ∈ cnf, Satisfied assignment c) :
    ¬ ∃ f, IsGraceful edges f ∧ Respects restriction f := by
  rintro ⟨f, h, hr⟩
  apply unsat
  exact ⟨witness edges f, fun c mem => witness_satisfies_clause h hr (hc c mem)⟩

/-- Row-major variable identifiers are injective when the column is bounded.
This applies separately to the X and Y blocks in DIMACS. -/
theorem row_major_injective (n u v a b : Nat) (hn : 0 < n) (ha : a < n) (hb : b < n)
    (he : u * n + a = v * n + b) : u = v ∧ a = b := by
  have hm := congrArg (fun k => k % n) he
  have hd := congrArg (fun k => k / n) he
  simp only [Nat.mul_add_mod_of_lt ha, Nat.mul_add_mod_of_lt hb] at hm
  dsimp at hd
  rw [Nat.mul_comm u n, Nat.mul_comm v n,
    Nat.mul_add_div hn, Nat.mul_add_div hn,
    Nat.div_eq_of_lt ha, Nat.div_eq_of_lt hb, Nat.add_zero, Nat.add_zero] at hd
  exact ⟨hd, hm⟩

/-- The largest X identifier is below every Y identifier (which starts at n²+1). -/
theorem x_block_bound (n u a : Nat) (hu : u < n) (ha : a < n) :
    1 + u * n + a ≤ n * n := by
  have hmul := Nat.mul_le_mul_right n (Nat.succ_le_of_lt hu)
  rw [Nat.succ_mul] at hmul
  omega

end Graceful.SAT
