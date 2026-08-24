const GLOBAL = {
    NUM_POINTS: 128,
    X_FOV: 45 * Math.PI / 180, // horizontal field of view
    Y_FOV: 90 * Math.PI / 180, // vertical field of view
    MAX_DISTANCE: 5000, // distance to the horizon
    SPEED: 20,
    REFRESH_RATE: 25
};

document.addEventListener('DOMContentLoaded', () => {
    // set the canvas dimensions to be the window dimensions
    const canvas = document.getElementById('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const simulator = new Simulator(canvas);
    simulator.start();
});

/*
 * Constructor function for the main simluation driver
 */
function Simulator(canvas) {
    this.points = [];
    this.screenWidth = canvas.width;
    this.screenHeight = canvas.height;

    /**
     * p1p2 is the window width or window height
     * angle p1p0p2 is the horizontal or vertical field of view
     * v is the horizontal or vertical viewing distance (what we need to determine)
     *
     * p1------------------p2
     *  \        |        /
     *   \       |       /
     *    \      |      /
     *     \     |     /
     *      \    |    /
     *       \   |   /
     *        \  |  /
     *         \ | /
     *          \|/
     *           p0
     */
    this.hViewDistance = (this.screenWidth / 2) / Math.tan(GLOBAL.X_FOV / 2); // horizontal viewing distance
    this.vViewDistance = (this.screenHeight / 2) / Math.tan(GLOBAL.Y_FOV / 2); // vertical viewing distance
    // initialize the points array
    for (let i = 0; i < GLOBAL.NUM_POINTS; i++) {
        const x = (Math.random() * this.screenWidth) - (this.screenWidth / 2); //we need to shift this x value to the left 1/2 screenWidth, since our origin is at the centre of the window
        const y = (Math.random() * this.screenHeight) - (this.screenHeight / 2); //we need to shift this y value up 1/2 screenHeight for the same reason
        const z = Math.random() * GLOBAL.MAX_DISTANCE;
        this.points.push(new Point(x, y, z));
    }

    this.context = canvas.getContext('2d');
    this.context.fillStyle = "rgba(255, 255, 255, .75)";
}

Simulator.prototype = {

    //start main event loop
    start: function () {
        setInterval(() => {
            this.updatePositions();
        }, GLOBAL.REFRESH_RATE);
    },

    // determine new x, y, z pos and draw the point
    updatePositions: function () {

        const ctx = this.context;
        ctx.clearRect(0, 0, this.screenWidth, this.screenHeight);

        ctx.save();

        //translate to centre of the window
        ctx.translate(this.screenWidth / 2, this.screenHeight / 2);

        for (const star of this.points) {

            star.z -= GLOBAL.SPEED;
            if (star.z <= 0) { star.z = GLOBAL.MAX_DISTANCE; }

            // determine projections
            star.projectedX = (star.x * this.hViewDistance) / star.z;
            star.projectedY = (star.y * this.vViewDistance) / star.z;

            // determine the new size
            star.projectedSize = (1 - (star.z / GLOBAL.MAX_DISTANCE)) * 3;

            // draw the point
            ctx.fillRect(star.projectedX, star.projectedY, star.projectedSize, star.projectedSize);
        }
        ctx.restore();
    }
};

/**
 * Constructor function for a Point object
 */
function Point(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.projectedX = 0;
    this.projectedY = 0;
    this.projectedSize = 0;
}
