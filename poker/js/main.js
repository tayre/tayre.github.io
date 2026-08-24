let rotation = 0;
let index = 0;
let frontshowing = true;
const card_vals = ["0", "&#xBD;", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?"];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('forward').addEventListener('click', EventHandlers.forwardClick);
    document.getElementById('back').addEventListener('click', EventHandlers.backClick);
});

const EventHandlers = {

    forwardClick: function () {
        EventHandlers.clickHandler(1);
    },

    backClick: function () {
        EventHandlers.clickHandler(-1);
    },

    clickHandler: function (direction) {

        index = mod(index + direction, card_vals.length);

        rotation = rotation + ((-1) * direction * 180);

        frontshowing = !frontshowing;

        if (frontshowing) {
            document.getElementById('front_content').innerHTML = card_vals[index];
        }
        else {
            document.getElementById('back_content').innerHTML = card_vals[index];
        }

        document.getElementById('box').style.transform = 'translateZ( -50px ) rotateY( ' + rotation + 'deg )';
    }
};

//A modulo function which allows for negative values of n
function mod(n, m) {
    return ((n % m) + m) % m;
}
