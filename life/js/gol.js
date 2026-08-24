const dim_x = 50;
const dim_y = 50;

document.addEventListener('DOMContentLoaded', () => {

    //create a new game
    const g = new GameOfLife(dim_x, dim_y);

    //add it to the DOM
    g.drawCanvas(document.body);

    //bind the controls to the game
    new Controls(g);

    //an acorn @see https://en.wikipedia.org/wiki/File:Game_of_life_acorn.svg
    g.toggleCell(8, 21);
    g.toggleCell(9, 23);
    g.toggleCell(10, 20);
    g.toggleCell(10, 21);
    g.toggleCell(10, 24);
    g.toggleCell(10, 25);
    g.toggleCell(10, 26);

    //a glider @see https://en.wikipedia.org/wiki/Glider_(Conway%27s_Game_of_Life)
    g.toggleCell(40, 36);
    g.toggleCell(40, 37);
    g.toggleCell(40, 38);
    g.toggleCell(39, 38);
    g.toggleCell(38, 37);
});

/**
 * Constructor function
 * @param {number} rows specifies the height of our Game of Life "grid"
 * @param {number} cols specifies the width of our Game of Life "grid"
 */
function GameOfLife(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.context = null;
    this.canvasID = "gameCanvas";

    //setup our 2D arrays
    this.currentGeneration = [];
    this.nextGeneration = [];

    this.resetCurrentGeneration();
    this.resetNextGeneration();
}

GameOfLife.prototype = {
    /**
     * Creates a canvas element, saves the context, inserts the element into the DOM, and binds any required event handlers
     * @param {Element} parent is the element the canvas will be appended to
     */
    drawCanvas: function (parent) {
        const canvas = document.createElement('canvas');
        canvas.id = this.canvasID;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        parent.appendChild(canvas);

        this.context = canvas.getContext('2d'); //save the context
        this.context.globalAlpha = 0.5;
        this.context.fillStyle = "#999";
        this.context.lineWidth = 1;
        canvas.addEventListener('mousedown', (event) => this.mouseDownHandler(event, canvas));
    },

    /**
     * Handle the mouse down event in the canvas
     */
    mouseDownHandler: function (event, canvas) {
        const x = event.pageX - canvas.offsetLeft;
        const y = event.pageY - canvas.offsetTop;
        const scale_x = window.innerWidth / dim_x;
        const scale_y = window.innerWidth / dim_y;
        const col = Math.floor(x / scale_x);
        const row = Math.floor(y / scale_y);
        this.toggleCell(row, col);
    },

    /**
     * Fills in a cell on the canvas if it is "on" otherwise the cell is cleared
     * @param {number} row specifies the ith row
     * @param {number} col specifies th jth column
     */
    paintCell: function (row, col) {
        const scale_x = window.innerWidth / dim_x;
        const scale_y = window.innerWidth / dim_y;

        if (this.currentGeneration[row][col]) {
            this.context.fillRect(col * scale_x, row * scale_y, scale_x, scale_y);
        }
        else {
            this.context.clearRect(col * scale_x, row * scale_y, scale_x, scale_y);
        }
    },

    /**
     * Turns a cell 'on' iff it is 'off'
     * @param {number} row specifies the ith row
     * @param {number} col specifies th jth column
     */
    toggleCell: function (row, col) {
        this.currentGeneration[row][col] = !this.currentGeneration[row][col]; //flip the bit
        this.paintCell(row, col);
    },

    /**
     * Iterates over the grid and paints each cell
     */
    paintGrid: function () {
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {
                this.paintCell(i, j);
            }
        }
    },

    /**
     * @return the number of neighbours of element (row, col) which are 'alive'
     */
    numNeighbours: function (row, col) {
        let count = 0;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                if (i === 0 && j === 0) {
                    continue; //don't count the element (row, col)
                }
                if (this.currentGeneration[mod(row + i, this.rows)][mod(col + j, this.cols)]) {
                    count++;
                }
            }
        }
        return count;
    },

    /**
     * This method performes one iteration of the Game of Life.
     * The rules for an interation are as follows:
     * 1. Any live cell with fewer than two live neighbours dies, as if caused by underpopulation.
     * 2. Any live cell with more than three live neighbours dies, as if by overcrowding.
     * 3. Any live cell with two or three live neighbours lives on to the next generation.
     * 4. Any dead cell with exactly three live neighbours becomes a live cell.
     *
     * @see https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life#Rules
     */
    step: function () {
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {

                const count = this.numNeighbours(i, j);
                const living = this.currentGeneration[i][j];

                if (living && count < 2 || living && count > 3) {
                    this.nextGeneration[i][j] = false;
                }

                else if (living && count == 2 || living && count == 3 || !living && count == 3) {
                    this.nextGeneration[i][j] = true;
                }
            }
        }
        this.currentGeneration = this.nextGeneration.slice();
        this.resetNextGeneration();
        this.paintGrid();
    },

    /**
     * Resets the game board
     */
    clear: function () {
        this.resetCurrentGeneration();
        this.resetNextGeneration();
        this.paintGrid();
    },

    /**
     * Set all elements of the currentGeneration array to false
     */
    resetCurrentGeneration: function () {
        for (let i = 0; i < this.rows; i++) {
            this.currentGeneration[i] = [];
            for (let j = 0; j < this.cols; j++) {
                this.currentGeneration[i][j] = false;
            }
        }
    },

    /**
     * Set all elements of the nextGeneration array to false
     */
    resetNextGeneration: function () {
        for (let i = 0; i < this.rows; i++) {
            this.nextGeneration[i] = [];
            for (let j = 0; j < this.cols; j++) {
                this.nextGeneration[i][j] = false;
            }
        }
    }
};

/**
 * The Controls object is the controller for the various DOM buttons
 * @param {object} game is an instance of a GameOfLife object
 */
function Controls(game) {
    this.playButtonID = 'play';
    this.stepButtonID = 'step';
    this.clearButtonID = 'clear';
    this.game = game;
    this.interval = null;
    this.attachEventHandlers();
}

Controls.prototype = {
    /*
     * The delay in ms between steps when the game is 'playing'
     */
    WAIT_TIME: 100,
    /**
     * Binds our various event handlers
     */
    attachEventHandlers: function () {
        document.getElementById(this.playButtonID).addEventListener('click', (event) => this.playButtonHandler(event));
        document.getElementById(this.stepButtonID).addEventListener('click', (event) => this.stepButtonHandler(event));
        document.getElementById(this.clearButtonID).addEventListener('click', (event) => this.clearButtonHandler(event));
    },

    /**
     * Our general click handler
     */
    buttonHandler: function (button) {
        clearInterval(this.interval); //stop the game
        for (const sibling of button.parentElement.children) {
            sibling.classList.remove('clicked');
        }
        button.classList.add('clicked');
    },

    /**
     * Handle the play button click event
     */
    playButtonHandler: function (event) {
        this.buttonHandler(event.currentTarget);
        this.interval = setInterval(() => {
            this.game.step();
        }, this.WAIT_TIME);
    },

    /**
     * Handle the step button click event
     */
    stepButtonHandler: function (event) {
        this.buttonHandler(event.currentTarget);
        this.game.step();
    },

    /**
     * Handle the clear button click event
     */
    clearButtonHandler: function (event) {
        this.buttonHandler(event.currentTarget);
        this.game.clear();
    }
};

//A modulo function which allows for negative values of n
function mod(n, m) {
    return ((n % m) + m) % m;
}
