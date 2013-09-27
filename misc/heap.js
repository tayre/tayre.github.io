/**
 * Implements a Heap
 */
function Heap(){
    var array = [];
    
    //O(logn)
    this.insert = function(element){
        array.push(element);
        siftUp(array.length);
    }
    
    this.toString = function(){
        return array.join(' ');
    }
    
    //O(logn)
    this.extractMax = function(){
        if (array.length > 0) {
            var r = array.shift();
            heapify(); //really this should be a siftDown from 0
            return r;
        }
    }
    
    var that = this;
    
    //O(logn)
    function siftUp(from){
        if (from > 1) {
        
            var parent = Math.floor(from / 2);
            parent--;
            from--; 
            if (array[parent] < array[from]) {
                array.swap(parent, from);
                siftUp(parent + 1)
            }
        }
    }
    
    function heapify(){
        for (var i = 1; i <= array.length; i++) {
            siftUp(i);
        }
    }
    
}


Array.prototype.swap = function(i, j){

    var temp = this[i];
    this[i] = this[j];
    this[j] = temp;
}
