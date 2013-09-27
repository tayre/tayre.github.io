var MAX = 9999;
$(document).ready(function(){
    $('#submit').bind('submit', function(event){
        event.preventDefault();
        var input = $(this).find('input:first').val();
        var number = parseInt(input);
        if (isNaN(number)) {
            alert('Input a number please.');
        }
        else if (parseInt(number) > MAX) {
            alert('Less than ' + MAX + ' please.')
        }
        else if(parseInt(number) === 0) {
            $('#output').html('<a href = "http://en.wikipedia.org/wiki/Roman_numerals#Zero">In general, there is no roman numeral for zero.</a>');
        }
        else {
            $('#output').html(intToRoman(number));
        }
    });
    
});

function isSquare(n) {

    var i = 2;

        while (i <= n) { 
            i *= i;
        }

    if(i == n) {
        return true;
    }

    return false;

}

function intToRoman(num){

    var lookup = {
        1000: 'M',
        500: 'D',
        100: 'C',
        50: 'L',
        10: 'X',
        9: 'IX',
        8: 'VIII',
        7: 'VII',
        6: 'VI',
        5: 'V',
        4: 'IV',
        3: 'III',
        2: "II",
        1: "I"
    }

    var lookupOrder = [1000, 500, 100, 50, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    var buffer = [], val = 0;
    
    for (var i = 0; i < lookupOrder.length; i++) {
        val = lookupOrder[i];
        while (num - val >= 0) {
            buffer.push(lookup[val]);
            num -= val;
        }
        
    }

    return (buffer.join(''));

}
