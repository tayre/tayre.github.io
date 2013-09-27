var rotation = 0;
var index = 0;
var frontshowing = true;
var card_vals = ["0", "&#xBD;", "1", "2", "3", "5", "8", "13", "20", "40", "100", '?'];

$(document).ready(function() {
    $("#forward").click(EventHandlers.forwardClick);
    $("#back").click(EventHandlers.backClick);
});

EventHandlers = {

    forwardClick: function() {
        EventHandlers.clickHandler(1);
    },

    backClick: function() {
        EventHandlers.clickHandler(-1);
    },

    clickHandler: function(direction) {

        index = (index + direction).mod(card_vals.length);

        rotation = rotation + ((-1) * direction * 180);

        frontshowing = !frontshowing;

        if(frontshowing) {
            $('#front_content').html(card_vals[index]);
        }

        else {            $('#back_content').html(card_vals[index]);
        }

        $('#box').css('-webkit-transform', 'translateZ( -50px ) rotateY( ' + rotation + 'deg )');
        $('#box').css('-moz-transform', 'translateZ( -50px ) rotateY( ' + rotation + 'deg )');

    }
}

Number.prototype.mod = function(n) {
    return ((this % n) + n) % n;
}