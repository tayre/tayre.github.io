const MAX = 9999;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('submit').addEventListener('submit', function (event) {
        event.preventDefault();
        const output = document.getElementById('output');
        const number = parseInt(this.querySelector('input').value, 10);
        if (isNaN(number)) {
            alert('Input a number please.');
        }
        else if (number > MAX) {
            alert('Less than ' + MAX + ' please.');
        }
        else if (number === 0) {
            output.innerHTML = '<a href="https://en.wikipedia.org/wiki/Roman_numerals#Zero">In general, there is no roman numeral for zero.</a>';
        }
        else {
            output.textContent = intToRoman(number);
        }
    });
});

function intToRoman(num) {

    const lookup = {
        1000: 'M',
        900: 'CM',
        500: 'D',
        400: 'CD',
        100: 'C',
        90: 'XC',
        50: 'L',
        40: 'XL',
        10: 'X',
        9: 'IX',
        5: 'V',
        4: 'IV',
        1: 'I'
    };

    const lookupOrder = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const buffer = [];

    for (const val of lookupOrder) {
        while (num - val >= 0) {
            buffer.push(lookup[val]);
            num -= val;
        }
    }

    return buffer.join('');
}
