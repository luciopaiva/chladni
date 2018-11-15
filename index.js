
const NUM_PARTICLES = 40000;
const MAX_GRADIENT_INTENSITY = 1/4;
const MAX_RANDOM_VIBRATION_INTENSITY = 2;
const HALF_MAX_RANDOM_VIBRATION_INTENSITY = MAX_RANDOM_VIBRATION_INTENSITY / 2;
const MIN_NODE_THRESHOLD = 1e-2;

/**
 * https://stackoverflow.com/a/52827031/778272
 * @returns {Boolean} true if system is big endian */
const isBigEndian = (() => {
    const array = new Uint8Array(4);
    const view = new Uint32Array(array.buffer);
    return !((view[0] = 1) & array[0]);
})();
console.info("Endianness: " + (isBigEndian ? "big" : "little"));

const rgbToVal = isBigEndian ?
    (r, g, b) => ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0:
    (r, g, b) => ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;

class Debouncer {
    constructor () { this.timer = null; }
    set(task, delay) {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            task();
        }, delay);
    }
}

// create canvas
const canvas = document.createElement("canvas");
canvas.classList.add("pixelated");
const c = canvas.getContext("2d");
/** @type {ImageData} */
let imageData = null;
document.body.appendChild(canvas);
const canvasScale = 2;
/** @type {Uint32Array} */
let buffer = null;
/** @type {Float32Array} */
let vibrationValues = null;
/** @type {Float32Array} */
let gradients = null;

let width = window.innerWidth / canvasScale;
let height = window.innerHeight / canvasScale;

const debounceTimer = new Debouncer();

const particles = new Float32Array(NUM_PARTICLES * 2);
const color = rgbToVal(0xff, 0x94, 0x30);
const backgroundColor = rgbToVal(0, 0, 0);

function init() {
    const fpsElem = document.getElementById("fps");
    let fpsCount = 0;
    const fallingElem = document.getElementById("falling");
    let fallingCount = 0;
    setInterval(() => {
        fpsElem.innerText = fpsCount.toString(); fpsCount = 0;
        fallingElem.innerText = fallingCount.toString(); fallingCount = 0;
    }, 1000);

    function recalculateGradients() {
        vibrationValues = new Float32Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const normX = Math.abs(height - x) / height;
                const normY = Math.abs(height - y) / height;
                const M = 4;
                const N = 5;
                const L = 1/4;  // empirically adjusted

                // Chladni equation
                vibrationValues[index] = Math.cos(N * normX * Math.PI / L) * Math.cos(M * normY * Math.PI / L) -
                    Math.cos(M * normX * Math.PI / L) * Math.cos(N * normY * Math.PI / L);

                // normalize from [-2..2] to [-1..1]
                vibrationValues[index] /= 2;

                // flip troughs to become crests (values map from [-1..1] to [0..1])
                vibrationValues[index] *= Math.sign(vibrationValues[index]);
            }
        }

        // Now that the vibration magnitude of each point in the plate was calculated, we can calculate gradients.
        // Particles are looking for nodal points (where vibration magnitude is zero), so gradients must point towards
        // the neighbor with lowest vibration.

        gradients = new Float32Array(width * height * 2);  // times 2 to contain x and y values for each point
        gradients.fill(0);  // borders will have null gradient
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const myIndex = y * width + x;
                const myVibration = vibrationValues[myIndex];
                if (myVibration < MIN_NODE_THRESHOLD) {
                    // we are already at a node position, so gradient is zero
                    gradients[myIndex * 2] = 0;
                    gradients[myIndex * 2 + 1] = 0;
                    continue;
                }

                let candidateGradients = [];
                candidateGradients.push([0, 0]);

                let minVibrationSoFar = Number.POSITIVE_INFINITY;
                for (let ny = -1; ny <= 1; ny++) {
                    for (let nx = -1; nx <= 1; nx++) {
                        if (nx === 0 && ny === 0) {
                            continue;  // ourselves!
                        }

                        const ni = (y + ny) * width + (x + nx);
                        const nv = vibrationValues[ni];

                        // if neighbor has *same* vibration as minimum so far, consider it as well to avoid biasing
                        if (nv <= minVibrationSoFar) {
                            const len = Math.hypot(nx, ny);
                            const gx = nx / len;
                            const gy = ny / len;
                            if (isNaN(gx) || isNaN(gy)) {
                                debugger;
                            }
                            if (nv < minVibrationSoFar) {
                                minVibrationSoFar = nv;
                                candidateGradients = [];
                            }
                            candidateGradients.push([gx, gy]);
                        }
                    }
                }

                const index = (y * width + x) * 2;
                // choose randomly to avoid biasing
                const chosenGradient = candidateGradients[Math.floor(Math.random() * candidateGradients.length)];

                gradients[index] = chosenGradient[0];
                gradients[index + 1] = chosenGradient[1];
            }
        }
    }

    // resize canvas to cover whole screen
    function resize() {
        width = Math.ceil(window.innerWidth / canvasScale);
        height = Math.ceil(window.innerHeight / canvasScale);
        canvas.setAttribute("width", width);
        canvas.setAttribute("height", height);

        imageData = c.getImageData(0, 0, width, height);
        buffer = new Uint32Array(imageData.data.buffer);
        recalculateGradients();
        console.info(`New buffer created (${width}x${height})`);

        for (let i = 0; i < particles.length; i += 2) {
            particles[i] = Math.random() * width;
            particles[i + 1] = Math.random() * height;
        }
    }
    window.addEventListener("resize", () => debounceTimer.set(resize, 350));
    resize();

    function didParticleFall(x, y) {
        const SLACK = 100;
        return x < -SLACK || x >= width + SLACK || y < -SLACK || y >= height + SLACK;
    }

    function cheapInterpolateGradientAt(x, y) {
        x = Math.round(x);
        y = Math.round(y);
        const index = (y * width + x) * 2;
        return [
            gradients[index],
            gradients[index + 1]
        ];
    }

    // animation loop
    function update() {
        buffer.fill(backgroundColor);

        // // debug gradients
        // const LUMINOSITY = 64;  // up to 256
        // for (let i = 0; i < vibrationValues.length; i++) {
        //     const intensity = vibrationValues[i] * LUMINOSITY;
        //     buffer[i] = rgbToVal(intensity, intensity, intensity);
        // }

        for (let i = 0; i < particles.length; i += 2) {
            let x = particles[i];
            let y = particles[i + 1];

            const [gradX, gradY] = cheapInterpolateGradientAt(x, y);

            // movement towards gradient
            x += MAX_GRADIENT_INTENSITY * gradX;
            y += MAX_GRADIENT_INTENSITY * gradY;

            // random vibration
            x += (Math.random() * MAX_RANDOM_VIBRATION_INTENSITY - HALF_MAX_RANDOM_VIBRATION_INTENSITY);
            y += (Math.random() * MAX_RANDOM_VIBRATION_INTENSITY - HALF_MAX_RANDOM_VIBRATION_INTENSITY);

            particles[i] = x;
            particles[i + 1] = y;

            buffer[Math.round(y) * width + Math.round(x)] = color;

            // ToDo do this check less frequently
            // replace sand if it fell from the plate
            if (didParticleFall(x, y)) {
                particles[i] = Math.random() * width;
                particles[i + 1] = Math.random() * height;
                fallingCount++;
            }
        }

        c.putImageData(imageData, 0, 0);

        fpsCount++;
        requestAnimationFrame(update);
    }
    update(performance.now());
}
init();
