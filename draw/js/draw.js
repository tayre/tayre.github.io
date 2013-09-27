//Global variables
var MOUSEDOWN = false;
var ctx = null;
var points = {};
var oldx = null;
var oldy = null;


$(document).ready(function(){
    attachHandlers();
    main();
});

function attachHandlers(){
    $('#canvas').live("mousedown touchstart", EventHandlers.mouseDown);
    $('#canvas').live("mouseup touchend", EventHandlers.mouseUp);
    $('#canvas').live("mousemove touchmove", EventHandlers.mouseMove);
}

EventHandlers = {
    mouseDown:function() {
        MOUSEDOWN = true;
        var x = event.pageX - document.getElementById("canvas").offsetLeft;
        var y = event.pageY - document.getElementById("canvas").offsetTop;
        drawPoint(x, y);
    },

    mouseUp: function() {
        oldx = null;
        oldy = null;
        MOUSEDOWN = false;
    },

    mouseMove: function() {
         if (MOUSEDOWN) {
            var x = event.pageX - document.getElementById("canvas").offsetLeft;
            var y = event.pageY - document.getElementById("canvas").offsetTop;
            drawPoint(x, y);
        }
    }
}

function drawPoint(x, y){

    points[x + "x" + y] = [x, y];

    
    if (oldx !== null) {
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(oldx, oldy);
        ctx.lineTo(x, y);
        ctx.stroke();

    }
    
	oldx = x;
    oldy = y;
    
    for (var i in points) {

        var x1 = points[i][0];
        var y1 = points[i][1];
        
        var d = Math.sqrt(((x - x1) * (x - x1)) + ((y - y1) * (y - y1)));
        
        if (d < Math.random()*20 && Math.random() >= 0.6) {
            ctx.globalAlpha = 0.2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x1, y1);
            ctx.stroke();
        }
    }
}


function main(){
    var canvas = document.getElementById('canvas');
    if (!canvas || !canvas.getContext) {
        return;
    }
    ctx = canvas.getContext('2d');
    
    ctx.strokeStyle = "green";
}

function getRandomInt(min, max)
{
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
