//global vars
var outputcanvas;
var copy;
var copycanvas;
var video;

$(document).ready(function() {
    init();

    setInterval(capture, 100);
    wakeUp();

});

function init() {

    video = document.getElementById('input-video');
    
    copycanvas = document.getElementById('copycanvas');
    ctx = copycanvas.getContext('2d');

    overlay = document.getElementById('overlay');
    overlayctx = overlay.getContext('2d');

    // Get the stream from the camera using getUserMedia
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    window.URL = window.URL || window.webkitURL || window.mozURL || window.msURL;
    if(navigator.getUserMedia) {
        // http://www.kanasansoft.com/weblab/2012/06/arguments_of_getusermedia.html
        var options = {
            video: true,
        };

        navigator.getUserMedia(options, successCallback, errorCallback);
        function successCallback(stream) {
            // Replace the source of the video element with the stream from the camera
            video.src = window.URL.createObjectURL(stream) || stream;
            video.play();
        }

        function errorCallback(error) {
            console.log('An error occurred: [CODE ' + error.code + ']');
        }

    }
    else {
        alert('getUserMedia is not supported in this browser.');
    }
    
    //draw output canvas frame very 10ms
    setInterval(drawFrame, 10);
    
}

function drawFrame() {
    ctx.drawImage(video, 0, 0, 320, 240);
}

// blend mode difference
function difference(target, data1, data2) {
    if(data1.length != data2.length) {
        return null;
    }
    var i = 0;
    while(i < (data1.length * 0.25)) {
        target[4 * i] = data1[4 * i] == 0 ? 0 : fastAbs(data1[4 * i] - data2[4 * i]);
        target[4 * i + 1] = data1[4 * i + 1] == 0 ? 0 : fastAbs(data1[4 * i + 1] - data2[4 * i + 1]);
        target[4 * i + 2] = data1[4 * i + 2] == 0 ? 0 : fastAbs(data1[4 * i + 2] - data2[4 * i + 2]);
        target[4 * i + 3] = 0xFF; ++i;
    }
}

//fast absolute value
function fastAbs(value) {
    return (value ^ (value >> 31)) - (value >> 31);
}

function capture() {

    //image capture 1
    var cap1 = ctx.getImageData(0, 0, 320, 240);
    //$("#outputimg").attr('src', copycanvas.toDataURL("image/png"));

    setTimeout(function() {
        //image capture 2, 15ms later
        var cap2 = ctx.getImageData(0, 0, 320, 240);
        var blendedData = ctx.createImageData(320, 240);
        diff(blendedData.data, cap1.data, cap2.data);
        overlayctx.putImageData(blendedData, 0, 0);

    }, 15);
}

function wakeUp() {
    $("#wakeup").removeClass('fadeOut');
    setTimeout(function() {
        $("#wakeup").addClass('fadeOut');
    }, 2000);

}

function diff(target, data1, data2) {
    if(data1.length != data2.length)
        return null;
    var i = 0;
    var count = 0;
    
    while(i < (data1.length * 0.25)) {
        var average1 = (data1[4 * i] + data1[4 * i + 1] + data1[4 * i + 2]) / 3;
        var average2 = (data2[4 * i] + data2[4 * i + 1] + data2[4 * i + 2]) / 3;
        var diff = threshold(fastAbs(average1 - average2));
        target[4 * i] = diff;
        target[4 * i + 1] = diff;
        target[4 * i + 2] = diff;
        target[4 * i + 3] = 0xFF;
        if(diff === 0)
            count++;
        ++i;
    }

    if(count > 3000) {
        wakeUp();
    }
}

function threshold(value) {
    return (value < 50) ? 0xFF : 0;
}

