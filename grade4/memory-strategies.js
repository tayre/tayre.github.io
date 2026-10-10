/**
 * Concrete shortcuts for a × b, always pictured as a rows of b dots.
 * summary gives a method without the numerical answer, for timed hints.
 * steps, equation, groups and flip contain solved totals, for study/reveal.
 */
export function getMemoryStrategy(a, b) {
  if (![a, b].every((value) => Number.isInteger(value) && value >= 1 && value <= 10)) {
    throw new RangeError('Memory strategies use whole numbers from 1 to 10.');
  }

  const answer = a * b;
  const group = (rows, label) => ({ rows, columns: b, label });
  const rowLabel = (rows) => `${rows} ${rows === 1 ? 'row' : 'rows'} of ${b} = ${rows * b}`;
  const strategy = {
    title: '', summary: '', steps: [], equation: '', groups: [],
    flip: `${b} × ${a} = ${answer}`,
  };

  switch (a) {
    case 1:
      Object.assign(strategy, {
        title: 'One group stays the same',
        summary: 'Multiplying by one keeps the other number the same.',
        steps: [`Start with one row of ${b}.`, 'One group keeps the number the same.'],
        equation: `1 × ${b} = ${answer}`,
        groups: [group(1, rowLabel(1))],
      });
      break;
    case 2:
      Object.assign(strategy, {
        title: 'Double it',
        summary: `Two rows mean ${b} + ${b}. Double ${b}.`,
        steps: [`Start with ${b}.`, `Add another ${b} to get ${answer}.`],
        equation: `${b} + ${b} = ${answer}`,
        groups: [group(2, rowLabel(2))],
      });
      break;
    case 3:
      Object.assign(strategy, {
        title: 'Double, then add a row',
        summary: `Double ${b}, then add one more group of ${b}.`,
        steps: [`Double ${b} to get ${2 * b}.`, `Add ${b} once more: ${2 * b} + ${b} = ${answer}.`],
        equation: `2 × ${b} + ${b} = ${answer}`,
        groups: [group(2, rowLabel(2)), group(1, `One more row = ${b}`)],
      });
      break;
    case 4:
      Object.assign(strategy, {
        title: 'Double twice',
        summary: `Double ${b}. Then double that answer.`,
        steps: [`Double ${b} to get ${2 * b}.`, `Double ${2 * b} to get ${answer}.`],
        equation: `2 × (2 × ${b}) = ${answer}`,
        groups: [group(2, rowLabel(2)), group(2, `Another 2 rows = ${2 * b}`)],
      });
      break;
    case 5:
      if (b <= 4) {
        const counts = Array.from({ length: b }, (_, index) => (index + 1) * 5);
        Object.assign(strategy, {
          title: 'Count in fives',
          summary: b === 1 ? 'Count the dots down the single column.' : `Each column has 5 dots. Count the ${b} columns in fives.`,
          steps: ['Look down a column: there are 5 dots.', `Count each column once: ${counts.join(', ')}.`],
          equation: `${b === 1 ? '5 × 1' : Array(b).fill('5').join(' + ')} = ${answer}`,
          groups: [group(5, rowLabel(5))],
        });
      } else {
        Object.assign(strategy, {
          title: 'Half of ten groups',
          summary: `Find 10 × ${b}, then take half. Five groups are half of ten.`,
          steps: [`10 × ${b} = ${10 * b}.`, `Half of ${10 * b} is ${answer}.`, 'The picture shows the 5 rows you keep.'],
          equation: `10 × ${b} ÷ 2 = ${answer}`,
          groups: [group(5, rowLabel(5))],
        });
      }
      break;
    case 6:
      Object.assign(strategy, {
        title: 'Five rows, plus one row',
        summary: `Use 5 × ${b}, then add one more group of ${b}.`,
        steps: [`5 × ${b} = ${5 * b}.`, `Add ${b}: ${5 * b} + ${b} = ${answer}.`],
        equation: `5 × ${b} + ${b} = ${answer}`,
        groups: [group(5, rowLabel(5)), group(1, `One more row = ${b}`)],
      });
      break;
    case 7:
      Object.assign(strategy, {
        title: 'Five groups plus two',
        summary: `Use 5 × ${b} and double ${b}. Add them together.`,
        steps: [`5 × ${b} = ${5 * b}.`, `Double ${b} to get ${2 * b}.`, `Add the parts: ${5 * b} + ${2 * b} = ${answer}.`],
        equation: `5 × ${b} + 2 × ${b} = ${answer}`,
        groups: [group(5, rowLabel(5)), group(2, `Two more rows = ${2 * b}`)],
      });
      break;
    case 8:
      Object.assign(strategy, {
        title: 'Double four groups',
        summary: `Find 4 × ${b}, then double it to make eight groups.`,
        steps: [`Double ${b} to get ${2 * b}.`, `Double again to get ${4 * b}.`, `Double ${4 * b} once more: ${answer}.`],
        equation: `2 × (4 × ${b}) = ${answer}`,
        groups: [group(4, rowLabel(4)), group(4, `Another 4 rows = ${4 * b}`)],
      });
      break;
    case 9:
      Object.assign(strategy, {
        title: 'Ten groups, take one away',
        summary: `Start with 10 × ${b}, then take away one group of ${b}.`,
        steps: [`10 groups of ${b} make ${10 * b}.`, `Take away ${b}: ${10 * b} − ${b} = ${answer}.`, 'The 9 rows left are pictured as 5 rows plus 4 rows.'],
        equation: `10 × ${b} − ${b} = ${answer}`,
        groups: [group(5, `First 5 of the 9 rows = ${5 * b}`), group(4, `Other 4 of the 9 rows = ${4 * b}`)],
      });
      break;
    case 10:
      Object.assign(strategy, {
        title: 'Put a zero after it',
        summary: `For these whole numbers, write a 0 after ${b}.`,
        steps: [`Start with ${b}.`, `Write a zero after it: ${answer}.`],
        equation: `10 × ${b} = ${answer}`,
        groups: [group(10, rowLabel(10))],
      });
      break;
  }

  return strategy;
}
