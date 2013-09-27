/**
 * Copyright (c) 2010 Tom Ayre ayre.tom@gmail.com
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 *
 */

GLOBAL = {
    width:  40,
    height: 40,
    darkColour: "rgba(0, 200, 0, 0.8)",
    lightColour: "rgba(0, 200, 0, 0.2)"
}
$(document).ready(function(){
    
	var canvas = document.getElementById('canvas');
	if(canvas.getContext) {
		var ctx = canvas.getContext('2d');
		setInterval(function(){
			draw(ctx);
		}, 1000);
	}
});

function draw(ctx){
  	drawUnit(ctx, getHours(), 0);        
 	drawUnit(ctx, getMinutes(), 210);
	drawUnit(ctx, getSeconds(), 420);
}

function getHours(){
    return getTimeUnit((new Date()).getHours());
}

function getMinutes(){
    return getTimeUnit((new Date()).getMinutes());
}

function getSeconds(){
    return getTimeUnit((new Date()).getSeconds());
}

function drawUnit(ctx, unit, xPos){
	var y_offset = 45;
	var x_offset = 45;
    for (var i = 0; i < unit.length; i++) {
        var currDigit = unit[i];
        for (var j = 0; j < currDigit.length; j++) {
            ctx.clearRect((x_offset  * j) + (xPos), y_offset  * i, GLOBAL.width, GLOBAL.height);
            if (currDigit[j] === '1') {
                ctx.fillStyle = GLOBAL.darkColour;
                ctx.fillRect((x_offset  * j) + (xPos), y_offset  * i, GLOBAL.width, GLOBAL.height);
            }
            else if (currDigit[j] === '0') {
                ctx.fillStyle = GLOBAL.lightColour;
                ctx.fillRect((x_offset  * j) + (xPos), y_offset  * i, GLOBAL.width, GLOBAL.height);
            }
        }
    }
}

function getTimeUnit(unit){
    unit = (unit < 10) ? "0" + unit : "" + unit;
    unit = unit.split("");
    var unitString = ""
    var unitResult = [];
    for (var i = 0; i < unit.length; i++) {
        var digit = parseInt(unit[i]).toString('2');
        var numBits = digit.length;
        for (var j = numBits; j <= 3; j++) {
            digit = "0" + digit;
        }
        unitString += (digit + "  ");
        unitResult.push(digit);
    }
    return unitResult;
}
