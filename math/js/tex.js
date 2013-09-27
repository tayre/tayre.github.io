var baseAPI = "http://chart.apis.google.com/chart"
var queryString = "?&cht=tx&chl="

$(document).ready(function(){
    $("#input").keyup(updateImage);
    showExample("\\sum_{i=1}^n i = \\frac{n(n+1)}{2}");
});

function showExample(example){
    $('#input').val(example);
    updateImage();
}

function updateImage(){
    $('img').show();
    var inputValue = encodeURIComponent($('#input').val());
    if (inputValue !== "") {
        var url = baseAPI + queryString + inputValue;
        $('img').attr('src', url);
    }
    else {
        $('img').hide();
    }
}

