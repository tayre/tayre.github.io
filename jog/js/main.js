$(document).ready(function () {
    init();
});

var timestep = 1000;

var curr_stage = 0;

var stages = [{
    'type': 'warmup',
    'duration': 240 // 4 mins
}, {
    'type': 'jog',
    'duration': 120 // 2 min
}, {
    'type': 'sprint',
    'duration': 60 // 1 min
}, {
    'type': 'jog',
    'duration': 120 // 1 min
}, {
    'type': 'sprint',
    'duration': 60 // 1 min
}, {
    'type': 'jog',
    'duration': 120 // 2 min
}, {
    'type': 'cooldown',
    'duration': 240 // 4 min
}]

var curr_duration = stages[0].duration;

var paused = false;
var started = false;

function init() {

    $("#pause").click(function () {

        if (!started) {
            started = true;
            INTERVAL = setInterval(animate, timestep);
            $("#pause").html("PAUSE");
        }

        else if (!paused) {
            clearInterval(INTERVAL);
            paused = true;
            $("#pause").html("RESUME");
        }

        else { //continue 
            paused = false;
            INTERVAL = setInterval(animate, timestep);
            $("#pause").html("PAUSE");
        }
    });
}


function animate() {
    if (curr_duration < 0) {
        curr_stage++;
        if (curr_stage >= stages.length) {
            clearInterval(INTERVAL);
            $("#pause").remove();
            $("#timer").remove();
            $("#phase").html("DONE!!!");
            $("#phase").addClass('done');
            return;
        } 
        else {
            curr_duration = stages[curr_stage].duration;
        }
    };

    var minute = Math.floor(curr_duration / 60);
    if (minute < 10) minute = "0" + minute;

    var second = curr_duration % 60;
    if (second < 10) second = "0" + second;

    $("#timer").html(minute + ":" + second);

    curr_duration--;

    $("#phase").html(stages[curr_stage].type);
    $("#phase").attr('class', '');
    $("#phase").addClass(stages[curr_stage].type);
    $("#info").html(curr_stage + ' / ' + stages.length);
}
