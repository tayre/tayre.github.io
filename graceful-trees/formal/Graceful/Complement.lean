import Graceful.Basic

namespace Graceful

def flip (x : Vertex m) : Vertex m := ⟨m - x.val, by omega⟩

def complement (f : Labeling m) : Labeling m := fun v => flip (f v)

theorem flip_involution (x : Vertex m) : flip (flip x) = x := by
  apply Fin.ext
  simp only [flip]
  have := x.isLt
  omega

theorem flip_distance (a b : Vertex m) :
    distance (flip a).val (flip b).val = distance a.val b.val := by
  simp only [distance, flip]
  have := a.isLt
  have := b.isLt
  omega

theorem complement_bijective {f : Labeling m} (h : Bijective f) :
    Bijective (complement f) := by
  constructor
  · intro u v huv
    apply h.1 u v
    have hflip := congrArg flip huv
    simpa only [complement, flip_involution] using hflip
  · intro label
    obtain ⟨v, hv⟩ := h.2 (flip label)
    exact ⟨v, by simp only [complement, hv, flip_involution]⟩

theorem complement_differences (edges : List (Edge m)) (f : Labeling m) :
    differences edges (complement f) = differences edges f := by
  induction edges with
  | nil => rfl
  | cons edge edges ih =>
    change distance (flip (f edge.1)).val (flip (f edge.2)).val ::
      differences edges (complement f) =
      distance (f edge.1).val (f edge.2).val :: differences edges f
    rw [flip_distance, ih]

theorem complement_graceful {edges : List (Edge m)} {f : Labeling m}
    (h : IsGraceful edges f) : IsGraceful edges (complement f) := by
  exact ⟨complement_bijective h.1, by rw [complement_differences]; exact h.2⟩

/-- The complement reduction preserves existence and every edge difference,
including a prescribed maximum-difference edge. It does not preserve solution counts. -/
theorem oriented_witness {edges : List (Edge m)} {f : Labeling m}
    (h : IsGraceful edges f) (u v : Vertex m) (hne : u ≠ v) :
    ∃ g : Labeling m, IsGraceful edges g ∧ (g u).val < (g v).val ∧
      ∀ a b, distance (g a).val (g b).val = distance (f a).val (f b).val := by
  by_cases hlt : (f u).val < (f v).val
  · exact ⟨f, h, hlt, fun _ _ => rfl⟩
  · refine ⟨complement f, complement_graceful h, ?_, ?_⟩
    · have hdistinct : (f u).val ≠ (f v).val := by
        intro heq
        exact hne (h.1.1 u v (Fin.ext heq))
      have := (f u).isLt
      have := (f v).isLt
      simp only [complement, flip]
      omega
    · intro a b
      exact flip_distance (f a) (f b)

end Graceful
