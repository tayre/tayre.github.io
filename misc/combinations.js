function combinations(str){

    str = str.split('');
    
    var length = str.length;
    
    var lookup = [];
    
    var numDigits = Math.pow(2, str.length);
    
    for (var i = 0; i < numDigits; i++) {
        var binDigit = i.toString('2')
        lookup.push(binDigit);
    }
    
    addLeadingZeros(lookup)
    console.log(lookup)
    
    var foo = [];
    
    for (var i = 0; i < lookup.length; i++) {
    
        var element = lookup[i];
        var output = "";
        for (var j = 0; j < element.length; j++) {
        
            if (element[j] === '1') {
            
                output += str[j]
                
            }
            
        }
        
        foo.push(output);
        
        
    }
    
    
    console.log(foo.length)
    console.log(foo);
    
    
}


function addLeadingZeros(lookup){

    var maxNumDigits = lookup[lookup.length - 1].length
    
    for (var i = 0; i < lookup.length; i++) {
    
        var element = lookup[i];
        
        if (element.length < maxNumDigits) {
        
            var delta = maxNumDigits - element.length
            
            for (var j = 0; j < delta; j++) {
                element = '0' + element;
            }
            
        }
        
        lookup[i] = element;
        
    }
    
}


function combinationsRec(word){

    if (word.length === 0) {
    
        return;
    }
    
    
    console.log(word);
    
    
    for (var i = 0; i < word.length; i++) {
        combinationsRec(word.substring(0, i) + word.substring(i + 1));
        
    }
    
    
}
