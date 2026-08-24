document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('input');
    const output = document.getElementById('output');

    const render = () => {
        katex.render(input.value, output, {
            displayMode: true,
            throwOnError: false
        });
    };

    input.addEventListener('input', render);

    //show an example
    input.value = '\\sum_{i=1}^n i = \\frac{n(n+1)}{2}';
    render();
});
