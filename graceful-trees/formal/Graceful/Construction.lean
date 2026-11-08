import Graceful.Basic

/-!
Arithmetic lemmas for the caterpillar traversal. These do not formalize tree
recognition or the Python loop: they prove the local interval invariant and the
descending differences once the traversal's stated hypotheses hold.
-/
namespace Graceful

theorem caterpillar_low_step (low high offset : Nat)
    (hlow : 0 < low) (hinterval : low ≤ high) (hoffset : offset ≤ high - low) :
    distance (low - 1) (high - offset) = high - low + 1 - offset := by
  simp only [distance]
  omega

theorem caterpillar_high_step (low high offset : Nat)
    (hinterval : low ≤ high) (hoffset : offset ≤ high - low) :
    distance (high + 1) (low + offset) = high - low + 1 - offset := by
  simp only [distance]
  omega

/-- Assigning the next spine vertex last leaves it just above the unused interval;
the following edge difference is one below the last difference of this phase. -/
theorem caterpillar_low_transition (low high count : Nat)
    (hlow : 0 < low) (hinterval : low ≤ high)
    (hcount : 0 < count) (havailable : count ≤ high - low + 1) :
    high - (count - 1) = (high - count) + 1 ∧
    distance (high - (count - 1)) low = high - low + 1 - count := by
  simp only [distance]
  omega

theorem caterpillar_high_transition (low high count : Nat)
    (hinterval : low ≤ high)
    (hcount : 0 < count) (havailable : count ≤ high - low + 1) :
    low + (count - 1) = (low + count) - 1 ∧
    distance (low + (count - 1)) high = high - low + 1 - count := by
  simp only [distance]
  omega

end Graceful
