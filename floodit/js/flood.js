MAX_ROWS = 14;
MAX_COLS = 14;
MAX_MOVES = 25;


$(document).ready(function() {

    $("#board_controls span").live('click', board_controls_click_handler);

    new_game(true, 0);

    Splash.welcome();

});


HighScores = {
    min: parseInt(localStorage.getItem('highScore')),

    getScore: function() {
        if(this.min) return this.min; return "";
    },

    setScore: function(score) {
        var intScore = parseInt(score);

        //set initial low score
        if(!this.min) {
            this.min = score;
            localStorage.setItem('highScore', this.min);
        }

        //new low score
        else if(intScore < this.min) {
            this.min = intScore;
            localStorage.setItem('highScore', this.min);
        }
    }
}

Level = {
    curr_level: 0,
    dim: [14, 21, 28], //rows can cols level 0, 1, 2
    moves: [25, 35, 45] //max number of moves for level 0, 1, 2
}

Output = {
    print: function(str) {
        $("#output").html(str);
    },

    clear: function() {
        $("#output").html('');
    }
}

Utils = {
    getRandomInt: function(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

DOM = {
    drawTable: function() {
        var buffer = [];
        buffer.push('<table>');
        for(var i = 0; i < MAX_ROWS; i++) {
            buffer.push('<tr>');
            for(var j = 0; j < MAX_COLS; j++) {
                buffer.push('<td></td>');
            }
            buffer.push('</tr>');
        }
        buffer.push('</table>');
        $('#table_container').html(buffer.join(''));
    }
}

Splash = {

    welcome: function() {
        Splash.show(['Pick a color...', 'flood the board...', 'and win!'], 300, 400);
    },

    pauseMessage: function(message) {
        var div = $("<div>");
        div.attr('id', 'splash');
        div.hide();
        div.html(message);

        $('body').append(div);
        div.delay(300).fadeIn();
    },

  congrats: function(num_moves) {
        
        var min = HighScores.getScore();
        
        var msg = [];

        msg.push(num_moves + ' moves!');

        if(!min || num_moves <  min) {
            msg.push('New low score!')
        }

        else {
            msg.push('Try and beat your personal best: ' + min + " moves")
        }

        HighScores.setScore(num_moves);

        switch(num_moves) {

            case 26:
                msg.push('Good job');
                break;

            case 25:
                msg.push('Not bad...');
                msg.push('Try for 24!');
                break;

            case 24:
                msg.push('Getting better...');
                msg.push('Go for 23!');
                break;

            case 23:
                msg.push('Well done!');
                msg.push('Can you hit 22?');
                break;

            case 22:
                msg.push('Super!');
                msg.push('This is too easy!');
                break;

            case 21:
                msg.push('Insane!');
                msg.push('How low can you go?');
                break;

            default:
                msg.push('You are a Jedi Master!');

        }

        Splash.playAgain(msg);
    },

    gameOver: function() {
        var msg = ['Too many moves...'];
        Splash.playAgain(msg);
    },

    playAgain: function(message) {

        $("#container").delay(500).fadeOut(300, function() {
            Splash.show(message, 300, 600, function() {

                Splash.pauseMessage('Touch to Play Again');

                $('#splash').live('mousedown touchstart', function() {
                    $("#splash").addClass('mousedown');
                });

                $('#splash').live('mouseup touchmove', function() {
                    
                    if (typeof navigator.vibrate !== 'undefined') { //vibrate
                        navigator.vibrate(25);
                    }
                    
                    $('#splash').die('mousedown touchstart mouseup touchmove')
                    
                    $("#splash").delay(500).fadeOut(function() {
                        new_game(false, Level.curr_level);
                        setTimeout(Splash.remove, 400);
                    });

                });

            });
        });

    },

    show: function(message_array, fade_delay, pause_delay, callback) {
        if($("#splash").length > 0)
            return;

        var div = $("<div>");
        div.attr('id', 'splash');
        div.hide();
        div.html(message_array[0]);

        $('body').append(div);
        div.fadeIn();

        var count = 1;

        var x = [];

        for(var i = 1; i < message_array.length; i++) {
            x.push(function(next) {
                $(this).delay(pause_delay).fadeOut(fade_delay, function() {
                    $(this).html(message_array[count++]);
                });

                $(this).fadeIn(fade_delay);
                next();
            });
        }

        x.push(function(next) {

            $(this).delay(pause_delay).fadeOut(fade_delay, function() {
                $(this).remove();
                if( typeof callback == 'function') {
                    callback();
                }
                else {
                    $("#container").fadeIn();
                }
            });
            next();
        });

        div.queue('fader', x).dequeue('fader');

    },

    remove: function() {
        $('#splash').remove();
        $('#container').fadeIn(Splash.delay);

    }
}

function Board() {
    this.curr_move = 0;

    this.gentabledata = function() {
        var temp = new Array(MAX_ROWS);

        for(var i = 0; i < MAX_ROWS; i++) {
            temp[i] = new Array(MAX_COLS);
        }

        for(var i = 0; i < MAX_ROWS; i++) {
            for(var j = 0; j < MAX_COLS; j++) {
                temp[i][j] = new Cell(false, Utils.getRandomInt(1, 6));
            }
        }

        return temp;
    };

    this.table = this.gentabledata();

    this.floodCell = function(row, col) {
        this.table[row][col].flooded = true;
    }

    this.reset = function() {
        this.curr_move = 0;
        delete this.table;

        this.table = this.gentabledata();
    }

    this.flood = function(colour) {
        /* Change the value/colour of all the flooded elements. */
        for(var i = 0; i < MAX_ROWS ; i++) {
            for(var j = 0; j < MAX_COLS; j++) {
                if(this.table[i][j].flooded) {
                    this.table[i][j].colour = colour;
                }
            }
        }

        /* Set flooded = true for all the neighbouring elements with the same colour. */
        for(var row = 0; row < MAX_ROWS; row++) {
            for(var col = 0; col < MAX_COLS; col++) {
                if(this.table[row][col].flooded) {
                    this.flood_neighbours(row, col, colour);
                }
            }
        }

        this.updateUI();
    }

    this.flood_neighbours = function(row, col, colour) {

        //up
        if(row > 0) {
            this.test_colour_flood(row - 1, col, colour);
        }

        //down
        if(row < MAX_ROWS - 1) {
            this.test_colour_flood(row + 1, col, colour);
        }

        //left
        if(col > 0) {
            this.test_colour_flood(row, col - 1, colour);
        }

        //right
        if(col < MAX_COLS - 1) {
            this.test_colour_flood(row, col + 1, colour);
        }
    }

    this.test_colour_flood = function(row, col, colour) {
        if(this.table[row][col].flooded) {
            return;
        }

        if(this.table[row][col].colour == colour) {
            this.table[row][col].flooded = true; //flood cell
            this.flood_neighbours(row, col, colour); // recursive call to flood any connected neighbours
        }
    }

    this.updateUI = function() {
        var domTDElement;
        for(var i = 0; i < MAX_ROWS; i++) {
            for(var j = 0; j < MAX_COLS; j++) {
                domTDElement = $($('tr').eq(i)).find('td').eq(j);
                domTDElement.attr('data-flooded', this.table[i][j].flooded);
                domTDElement.attr('data-val', this.table[i][j].colour);
            }
        }
    }


    this.allFlooded = function() {
        for(var i = 0; i < MAX_ROWS; i++) {
            for(var j = 0; j < MAX_COLS; j++) {
                if(!this.table[i][j].flooded)
                    return false;
            }
        }
        return true;
    }
}

function Cell(flooded, colour) {
    this.flooded = flooded;
    this.colour = colour;
}



//@param init_game: true iff this is a game starting at level 0
function new_game(init_game, level) {

    Level.curr_level = level;
    Output.clear();

    if( typeof g == 'undefined') {
        g = new Board();
        Output.print('To start, pick a color from the bottom of the screen.');
    }

    else {
        g.reset();
    }

    g.floodCell(0, 0);
    DOM.drawTable();
    g.updateUI();
}

function board_controls_click_handler() {

    if($("#instructions").length > 0) {
        $("#instructions").fadeOut(400);
    }

    var val = $(this).attr('data-val');

    if(val == g.table[0][0].colour) {
        Output.print("Pick a different color!");
        return false

    };

    g.flood(val);

    g.curr_move++;

    Output.print("Move: " + g.curr_move + " of " + MAX_MOVES);

    if(g.allFlooded()) {
        $("#container").delay(350).fadeOut(350, function() {
            Splash.congrats(g.curr_move);
        });
    }

    else if(g.curr_move >= MAX_MOVES) {
        Splash.gameOver();
    }

    return false;
}

