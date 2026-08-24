//global vars
let video;
let copycanvas;
let ctx;
let overlay;
let overlayctx;

document.addEventListener('DOMContentLoaded', () => {
    init();

    setInterval(capture, 100);
    wakeUp();
});

function init() {

    video = document.getElementById('input-video');

    copycanvas = document.getElementById('copycanvas');
    ctx = copycanvas.getContext('2d', { willReadFrequently: true });

    overlay = document.getElementById('overlay');
    overlayctx = overlay.getContext('2d');

    // Get the stream from the camera
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then((stream) => {
                video.srcObject = stream;
                video.play();
            })
            .catch((error) => {
                console.log('An error occurred: ' + error.name);
                alert('Could not access the camera: ' + error.name);
            });
    }
    else {
        alert('getUserMedia is not supported in this browser.');
    }

    //draw output canvas frame every 10ms
    setInterval(drawFrame, 10);
}

function drawFrame() {
    ctx.drawImage(video, 0, 0, 320, 240);
}

//fast absolute value
function fastAbs(value) {
    return (value ^ (value >> 31)) - (value >> 31);
}

function capture() {

    //image capture 1
    const cap1 = ctx.getImageData(0, 0, 320, 240);

    setTimeout(() => {
        //image capture 2, 15ms later
        const cap2 = ctx.getImageData(0, 0, 320, 240);
        const blendedData = ctx.createImageData(320, 240);
        diff(blendedData.data, cap1.data, cap2.data);
        overlayctx.putImageData(blendedData, 0, 0);
    }, 15);
}

function wakeUp() {
    const el = document.getElementById('wakeup');
    el.classList.remove('fadeOut');
    setTimeout(() => {
        el.classList.add('fadeOut');
    }, 2000);
}

function diff(target, data1, data2) {
    if (data1.length !== data2.length)
        return null;
    let i = 0;
    let count = 0;

    while (i < (data1.length * 0.25)) {
        const average1 = (data1[4 * i] + data1[4 * i + 1] + data1[4 * i + 2]) / 3;
        const average2 = (data2[4 * i] + data2[4 * i + 1] + data2[4 * i + 2]) / 3;
        const diff = threshold(fastAbs(average1 - average2));
        target[4 * i] = diff;
        target[4 * i + 1] = diff;
        target[4 * i + 2] = diff;
        target[4 * i + 3] = 0xFF;
        if (diff === 0)
            count++;
        ++i;
    }

    if (count > 3000) {
        wakeUp();
    }
}

function threshold(value) {
    return (value < 50) ? 0xFF : 0;
}
