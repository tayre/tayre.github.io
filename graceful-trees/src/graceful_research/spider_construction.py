"""Closed-form prescribed-zero labelings of equal-leg spiders.

For k >= 1, label the hub 1, the distinguished leg
    (4k, 0, 4k-2, 3),
and leg i, 2 <= i <= k,
    (4k+5-4i, 4i-4, 4k-4i+2, 4i-1).

The four-edge formula specializes the known rooted subdivision/matching lift.
The five-edge formula places zero at distance two from the hub. Neither the
implementation nor its finite verification sweep asserts research novelty;
the general algebraic proofs and literature assessment are separate.
"""

ALGORITHM = "length-four-spider-midpoint-formula-v1"
FIVE_EDGE_ALGORITHM = "length-five-spider-depth-two-formula-v1"
FIVE_EDGE_INTERNAL_ALGORITHM = "length-five-spider-adjacent-internal-extremes-v1"
MAX_VERTICES = 1_000_001


def midpoint_zero_spider(legs, *, root_leg=0, max_vertices=MAX_VERTICES):
    """Return the complete labeled tree, with zero at the chosen leg's midpoint.

    Vertices are numbered hub 0, then each leg's four vertices in outward
    order. ``root_leg`` is zero-based. The finite allocation guard is an
    implementation limit, not a restriction in the mathematical statement.
    Neither search nor a solver is used. Verify the returned witness with the
    independent ``verify_labeling`` before relying on or publishing it.
    """
    if type(legs) is not int or legs < 1:
        raise ValueError("legs must be a positive integer")
    if type(root_leg) is not int or not 0 <= root_leg < legs:
        raise ValueError("root_leg must be an integer in 0..legs-1")
    if type(max_vertices) is not int or max_vertices < 1:
        raise ValueError("max_vertices must be a positive integer")
    n = 4 * legs + 1
    if n > max_vertices:
        raise ValueError("constructed tree exceeds max_vertices")

    labels = [1, 4 * legs, 0, 4 * legs - 2, 3]
    edges = []
    for i in range(1, legs + 1):
        first = 4 * i - 3
        edges.append([0, first])
        edges.extend([first + j, first + j + 1] for j in range(3))
        if i >= 2:
            labels.extend([4 * legs + 5 - 4 * i, 4 * i - 4, 4 * legs - 4 * i + 2, 4 * i - 1])

    if root_leg:
        first = 4 * root_leg + 1
        labels[1:5], labels[first : first + 4] = labels[first : first + 4], labels[1:5]
    return {
        "n": n,
        "edges": edges,
        "labels": labels,
        "root": 4 * root_leg + 2,
        "legs": legs,
        "leg_length": 4,
        "root_leg": root_leg,
        "root_distance": 2,
        "algorithm": ALGORITHM,
    }


def five_edge_spider_depth_two_zero(legs, *, root_leg=0, max_vertices=MAX_VERTICES):
    """Label S(k,5) gracefully with zero at any selected depth-two vertex.

    Hub label: 1. First leg: (5k, 0, 5k-2, 4, 5k-3).
    Leg i, 2 <= i <= k:
        (5k-5i+6, 5i-5, 5k-5i+3, 5i-1, 5k-5i+2).

    The three disjoint sets of edge weights are the multiples of five and
    the absolute values of the two progressions
        2-5k, 7-5k, ..., 5k-3;
        4-5k, 9-5k, ..., 5k-1.
    Each progression contains 2k entries in one nonzero residue class, so
    no two entries have equal absolute value. Together the three sets are
    exactly 1..5k. This argument applies to every positive integer k.

    Vertex numbering, allocation limits and verification requirements agree
    with ``midpoint_zero_spider``, with five vertices per leg instead of four.
    """
    if type(legs) is not int or legs < 1:
        raise ValueError("legs must be a positive integer")
    if type(root_leg) is not int or not 0 <= root_leg < legs:
        raise ValueError("root_leg must be an integer in 0..legs-1")
    if type(max_vertices) is not int or max_vertices < 1:
        raise ValueError("max_vertices must be a positive integer")
    n = 5 * legs + 1
    if n > max_vertices:
        raise ValueError("constructed tree exceeds max_vertices")

    labels = [1, 5 * legs, 0, 5 * legs - 2, 4, 5 * legs - 3]
    edges = []
    for i in range(1, legs + 1):
        first = 5 * i - 4
        edges.append([0, first])
        edges.extend([first + j, first + j + 1] for j in range(4))
        if i >= 2:
            labels.extend(
                [
                    5 * legs - 5 * i + 6,
                    5 * i - 5,
                    5 * legs - 5 * i + 3,
                    5 * i - 1,
                    5 * legs - 5 * i + 2,
                ]
            )

    if root_leg:
        first = 5 * root_leg + 1
        labels[1:6], labels[first : first + 5] = labels[first : first + 5], labels[1:6]
    return {
        "n": n,
        "edges": edges,
        "labels": labels,
        "root": 5 * root_leg + 2,
        "legs": legs,
        "leg_length": 5,
        "root_leg": root_leg,
        "root_distance": 2,
        "algorithm": FIVE_EDGE_ALGORITHM,
    }


def five_edge_spider_internal_zero(legs, *, root_distance=2, root_leg=0, max_vertices=MAX_VERTICES):
    """Give either internal orbit of S(k,5) label zero, for every k >= 1.

    Before optional complementation, the hub is 1 and the first leg is
        (5k-1, 0, 5k, 3, 5k-3).
    For 2 <= i <= k-1, leg i is
        (5k-5i+6, 5i-1, 5k-5i, 5i-2, 5k-5i+2).
    When k >= 2, the last leg is (6, 5k-2, 2, 5k-5, 4).

    Thus the depth-two/depth-three edge has the two extreme labels. For
    ``root_distance=3``, complement every label x to 5k-x. Every difference
    is preserved, while zero moves to depth three. The k=1 first-leg formula
    works directly. For k>=2 the vertex residues partition 0..5k, and the
    edge weights partition into multiples of five and absolute progressions
    2-5k,7-5k,...,5k-3 and 4-5k,9-5k,...,5k-1, proving gracefulness.
    """
    if type(legs) is not int or legs < 1:
        raise ValueError("legs must be a positive integer")
    if type(root_distance) is not int or root_distance not in (2, 3):
        raise ValueError("root_distance must be 2 or 3")
    if type(root_leg) is not int or not 0 <= root_leg < legs:
        raise ValueError("root_leg must be an integer in 0..legs-1")
    if type(max_vertices) is not int or max_vertices < 1:
        raise ValueError("max_vertices must be a positive integer")
    n = 5 * legs + 1
    if n > max_vertices:
        raise ValueError("constructed tree exceeds max_vertices")

    labels = [1, 5 * legs - 1, 0, 5 * legs, 3, 5 * legs - 3]
    edges = []
    for i in range(1, legs + 1):
        first = 5 * i - 4
        edges.append([0, first])
        edges.extend([first + j, first + j + 1] for j in range(4))
        if i == legs and legs >= 2:
            labels.extend([6, 5 * legs - 2, 2, 5 * legs - 5, 4])
        elif i >= 2:
            labels.extend(
                [
                    5 * legs - 5 * i + 6,
                    5 * i - 1,
                    5 * legs - 5 * i,
                    5 * i - 2,
                    5 * legs - 5 * i + 2,
                ]
            )

    if root_distance == 3:
        labels = [5 * legs - label for label in labels]
    if root_leg:
        first = 5 * root_leg + 1
        labels[1:6], labels[first : first + 5] = labels[first : first + 5], labels[1:6]
    extreme_edge = [5 * root_leg + 2, 5 * root_leg + 3]
    return {
        "n": n,
        "edges": edges,
        "labels": labels,
        "root": 5 * root_leg + root_distance,
        "legs": legs,
        "leg_length": 5,
        "root_leg": root_leg,
        "root_distance": root_distance,
        "restriction": {"kind": "extreme_edge", "edge": extreme_edge},
        "algorithm": FIVE_EDGE_INTERNAL_ALGORITHM,
    }
