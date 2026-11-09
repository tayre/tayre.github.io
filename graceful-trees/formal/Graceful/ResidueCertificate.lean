import Graceful.Basic

/-!
The algebraic implication behind residual congruence certificates. Columns encode
branch instances, labels, and differences; a completion covers a target vector.
This proves that an annihilating modular functional excludes such a cover. It
does not formalize Python column enumeration, the checker, or graceful trees.
-/
namespace Graceful.ResidueCertificate

def sumTo (f : Nat → Nat) : Nat → Nat
  | 0 => 0
  | n + 1 => sumTo f n + f n

def dot (rows : Nat) (weights column : Nat → Nat) : Nat :=
  sumTo (fun i => weights i * column i) rows

theorem sumTo_congr (f g : Nat → Nat) (n : Nat)
    (h : ∀ i, i < n → f i = g i) : sumTo f n = sumTo g n := by
  induction n with
  | zero => rfl
  | succ n ih =>
    simp only [sumTo]
    rw [ih (fun i hi => h i (by omega)), h n (by omega)]

theorem sumTo_add (f g : Nat → Nat) (n : Nat) :
    sumTo (fun i => f i + g i) n = sumTo f n + sumTo g n := by
  induction n with
  | zero => rfl
  | succ n ih => simp [sumTo, ih, Nat.add_assoc, Nat.add_comm, Nat.add_left_comm]

theorem dot_sum_columns (rows count : Nat) (weights : Nat → Nat)
    (columns : Nat → Nat → Nat) :
    dot rows weights (fun i => sumTo (fun j => columns j i) count) =
      sumTo (fun j => dot rows weights (columns j)) count := by
  induction count with
  | zero => simp [dot, sumTo]; induction rows <;> simp_all [sumTo]
  | succ count ih =>
    simp only [sumTo, dot, Nat.mul_add]
    rw [sumTo_add]
    exact congrArg (fun value => value + dot rows weights (columns count)) ih

theorem sumTo_mod_zero (f : Nat → Nat) (n modulus : Nat)
    (h : ∀ i, i < n → f i % modulus = 0) : sumTo f n % modulus = 0 := by
  induction n with
  | zero => simp [sumTo]
  | succ n ih =>
    rw [sumTo, Nat.add_mod, ih (fun i hi => h i (by omega)), h n (by omega)]
    simp

/-- Any finite sequence of allowed columns is excluded if its sum would be the
target but every column has zero functional residue and the target does not.
No primality assumption is needed for this implication; discovery may use fields.
-/
theorem modular_obstruction (rows count modulus : Nat) (weights target : Nat → Nat)
    (columns : Nat → Nat → Nat)
    (annihilates : ∀ j, j < count → dot rows weights (columns j) % modulus = 0)
    (separates : dot rows weights target % modulus ≠ 0) :
    ¬ (∀ i, i < rows → sumTo (fun j => columns j i) count = target i) := by
  intro cover
  have transported : dot rows weights target =
      dot rows weights (fun i => sumTo (fun j => columns j i) count) := by
    apply sumTo_congr
    intro i hi
    exact congrArg (fun value => weights i * value) (cover i hi).symm
  apply separates
  rw [transported, dot_sum_columns]
  exact sumTo_mod_zero _ _ _ annihilates

end Graceful.ResidueCertificate
