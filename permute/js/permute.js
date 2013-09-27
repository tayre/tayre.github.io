
$(document).ready(function(){
    $('#container form').submit(submitHandler);
});

function submitHandler(event){
    event.preventDefault();
    var input = $(this).find('input').val();

        var charArray = input.split("");
        
        for(var i = 0; i<charArray.length; i++) {
            charArray[i] += "<sub>" + i + "</sub>"
        }

        var results = [];
        permute(charArray, 0, results);
        print(results);

}

function permute(array, d, results){
    if (d == array.length) {
        results.push("<li>" + array.join('') + "</li>");
    }

    else {
        for (var i = d; i < array.length; i++) {
            swap(array, d, i);
            permute(array, d + 1, results);
            swap(array, i, d);
        }
    }
}

function swap(array, i, j){
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
}

function print(array){
    $("#output").html(array.join(''));
}
