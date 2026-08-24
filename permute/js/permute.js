document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('#container form').addEventListener('submit', submitHandler);
});

function submitHandler(event) {
    event.preventDefault();
    const input = this.querySelector('input').value;

    const charArray = input.split('').map((c, i) => c + '<sub>' + i + '</sub>');

    const results = [];
    permute(charArray, 0, results);
    print(results);
}

function permute(array, d, results) {
    if (d === array.length) {
        results.push('<li>' + array.join('') + '</li>');
    }

    else {
        for (let i = d; i < array.length; i++) {
            swap(array, d, i);
            permute(array, d + 1, results);
            swap(array, i, d);
        }
    }
}

function swap(array, i, j) {
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
}

function print(array) {
    document.getElementById('output').innerHTML = array.join('');
}
