
import * as Utils from "./utils.js";
import {Debouncer} from "./utils.js";

const NUM_PARTICLES = 40000;
const DEFAULT_RANDOM_VIBRATION_INTENSITY = 2;
const MAX_GRADIENT_INTENSITY = .4;
const DEBUG_VIBRATION_LEVELS = false;
const CANVAS_SCALE = 2;


class ChladniApp {

    constructor () {
        this.canvas = document.createElement("canvas");
        this.canvas.classList.add("pixelated");
        this.context = this.canvas.getContext("2d");
        document.body.appendChild(this.canvas);

        /** @type {ImageData} */
        this.imageData = null;

        /** @type {Uint32Array} */
        this.buffer = null;
        /** @type {Float32Array} */
        this.vibrationValues = null;
        /** @type {Float32Array} */
        this.gradients = null;

        this.vibrationIntensity = DEFAULT_RANDOM_VIBRATION_INTENSITY;
        this.halfVibrationIntensity = this.vibrationIntensity / 2;

        this.width = window.innerWidth / CANVAS_SCALE;
        this.height = window.innerHeight / CANVAS_SCALE;

        this.fpsCount = 0;
        this.fallingCount = 0;

        const debounceTimer = new Debouncer();

        this.particles = new Float32Array(NUM_PARTICLES * 2);

        this.nonResonantColor = Utils.cssColorToColor(Utils.readCssVarAsHexNumber("non-resonant-color"));
        this.colorIndex = 0;
        this.colors = [];
        let cssColorIndex = 1;
        let cssColor;
        while (cssColor = Utils.readCssVarAsHexNumber("particle-color-" + cssColorIndex)) {
            this.colors.push(Utils.cssColorToColor(cssColor));
            cssColorIndex++;
        }
        console.info(this.colors);
        this.selectedColor = this.colors[this.colorIndex];

        this.backgroundColor = Utils.cssColorToColor(Utils.readCssVarAsHexNumber("background-color"));

        this.initStatus();

        this.worker = new Worker("gradient-worker.js");
        this.worker.addEventListener("message", this.onMessageFromWorker.bind(this));

        window.addEventListener("resize", () => debounceTimer.set(this.resize.bind(this), 350));
        this.resize();

        this.updateFn = this.update.bind(this);
        this.update(performance.now());
    }

    initStatus() {
        this.fpsElem = document.getElementById("fps");
        this.fallingElem = document.getElementById("falling");
        setInterval(() => {
            this.fpsElem.innerText = this.fpsCount.toString(); this.fpsCount = 0;
            this.fallingElem.innerText = this.fallingCount.toString(); this.fallingCount = 0;
        }, 1000);
    }

    resize() {
        this.width = Math.ceil(window.innerWidth / CANVAS_SCALE);
        this.height = Math.ceil(window.innerHeight / CANVAS_SCALE);
        this.canvas.setAttribute("width", this.width);
        this.canvas.setAttribute("height", this.height);

        this.worker.postMessage({
            width: this.width,
            height: this.height,
        });

        this.imageData = this.context.getImageData(0, 0, this.width, this.height);
        this.buffer = new Uint32Array(this.imageData.data.buffer);
        // recalculateGradients();
        console.info(`New buffer created (${this.width}x${this.height})`);

        for (let i = 0; i < this.particles.length; i += 2) {
            this.particles[i] = Math.random() * this.width;
            this.particles[i + 1] = Math.random() * this.height;
        }
    }

    onMessageFromWorker(message) {
        console.info("Message from worker");
        this.vibrationIntensity = message.data.vibrationIntensity;
        this.halfVibrationIntensity = this.vibrationIntensity / 2;
        this.vibrationValues = message.data.vibrationValues ? new Float32Array(message.data.vibrationValues) : null;
        this.gradients = message.data.gradients ? new Float32Array(message.data.gradients) : null;
        if (this.gradients) {
            this.colorIndex = (this.colorIndex + 1) % this.colors.length;
            this.selectedColor = this.colors[this.colorIndex];
        }
    }

    didParticleFall(x, y) {
        const SLACK = 100;
        return x < -SLACK || x >= this.width + SLACK || y < -SLACK || y >= this.height + SLACK;
    }

    obtainGradientAt(x, y) {
        // used to lerp nearest gradient grid corners here, but it's too expensive and doesn't make any visual difference
        x = Math.round(x);
        y = Math.round(y);
        const index = (y * this.width + x) * 2;
        return [
            this.gradients[index],
            this.gradients[index + 1]
        ];
    }

    update() {
        this.buffer.fill(this.backgroundColor);

        if (DEBUG_VIBRATION_LEVELS && this.vibrationValues) {
            const MAX_LUMINOSITY = 32;  // up to 256
            for (let i = 0; i < this.vibrationValues.length; i++) {
                const intensity = this.vibrationValues[i] * MAX_LUMINOSITY;
                this.buffer[i] = Utils.rgbToVal(intensity, intensity, intensity);
            }
        }

        const color = this.gradients ? this.selectedColor : this.nonResonantColor;

        for (let i = 0; i < this.particles.length; i += 2) {
            let x = this.particles[i];
            let y = this.particles[i + 1];

            if (this.gradients) {
                const [gradX, gradY] = this.obtainGradientAt(x, y);

                // descend gradient
                x += MAX_GRADIENT_INTENSITY * gradX;
                y += MAX_GRADIENT_INTENSITY * gradY;
            }

            // random vibration
            x += (Math.random() * this.vibrationIntensity - this.halfVibrationIntensity);
            y += (Math.random() * this.vibrationIntensity - this.halfVibrationIntensity);

            this.particles[i] = x;
            this.particles[i + 1] = y;

            this.buffer[Math.round(y) * this.width + Math.round(x)] = color;

            // ToDo do this check less frequently
            // replace sand if it fell from the plate
            if (this.didParticleFall(x, y)) {
                this.particles[i] = Math.random() * this.width;
                this.particles[i + 1] = Math.random() * this.height;
                this.fallingCount++;
            }
        }

        this.context.putImageData(this.imageData, 0, 0);

        this.fpsCount++;
        requestAnimationFrame(this.updateFn);
    }
}

new ChladniApp();
