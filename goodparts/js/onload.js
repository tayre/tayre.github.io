
$(document).ready(function(){
    $('#container button').live('click', function(event){
        clear();
		var src = ($(this).prev('pre').text());
        eval(src);
    	
	});
    
    $('#container pre').each(function(){
        $(this).after('<button>eval(...)</button>')
    });
});

function clear() {
	$("#output").empty();
}

function print(str){
    $('#output').append(str + "<br/>");
}
