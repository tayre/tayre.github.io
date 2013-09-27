$(document).ready(function(){



});


function binarySearch(array, key){

    if (array.length == 0) 
        return false;
    
    var guess = array.length / 2;
    var guessValue = array[guess];
    if (guessValue === key) 
        return true;
    
    if (guessValue < key) {
        return binarySearch(array.slice(guess + 1, array.length), key)
    }
    
    else {
        return binarySearch(array.slice(0, guess), key);
    }
    
}



function firstUnique(str){

    var lookup = {};
    
    for (var i = 0; i < str.length; i++) {
    
        if (typeof lookup[str[i]] === 'undefined') 
            lookup[str[i]] = 1;
        else 
            lookup[str[i]]++;
        
    }
    
    for (var i = 0; i < str.length; i++) 
        if (lookup[str[i]] === 1) 
            return str[i];
    
}


//O(logn)
function siftUp(array, from){
    //debugger;
    if (from > 1) {
    
        var parent = Math.floor(from / 2);
        parent--;
        from--;
        if (array[parent] < array[from]) {
            array.swap(parent, from);
            siftUp(array, parent + 1)
        }
    }
}

function heapify(array){
    for (var i = 1; i <= array.length; i++) {
        siftUp(array, i);
    }
}



Array.prototype.swap = function(i, j){

    var temp = this[i];
    this[i] = this[j];
    this[j] = temp;
}




function isPrime(n){

    //divide n by 2 to n-1, if remainder is 0 return false
    //return true
    
    if (n === 2) 
        return true;
    if (n % 2 === 0) 
        return false;
    if (n === 3) 
        return true;
    if (n % 3 === 0) 
        return false;
    
    
    var upperBound = Math.ceil(Math.sqrt(n));
    
    var i = 6;
    var k = 1;
    
    while (true) {
    
        if (i > upperBound) 
            break;
        
        i = 6 * k - 1;
        if (n % i === 0) 
            return false;
        
        
        i = 6 * k + 1;
        if (n % i === 0) 
            return false;
        
        
        k++;
    }
    
    return true;
    
}
