
const MODERATE_RANDOM_VIBRATION_INTENSITY = 3;
const AGGRESSIVE_RANDOM_VIBRATION_INTENSITY = MODERATE_RANDOM_VIBRATION_INTENSITY * 1.5;
const MIN_NODE_THRESHOLD = 1e-2;

const L1 = 1/8;
const L2 = 1/4;
const L3 = 1/3;

class ChladniParams {
    constructor (m, n, l) {
        this.m = m;
        this.n = n;
        this.l = l;
    }
}

const CHLADNI_PARAMS = [
    new ChladniParams(1, 2, L1),
    new ChladniParams(1, 3, L2),
    new ChladniParams(1, 4, L3),
    new ChladniParams(1, 5, L2),
    new ChladniParams(2, 3, L3),
    new ChladniParams(2, 5, L2),
    new ChladniParams(3, 4, L3),
    new ChladniParams(3, 5, L2),
    new ChladniParams(4, 5, L3),
];

class GradientWorker {

    constructor () {
        this.vibrationValues = null;
        this.gradients = null;
        this.width = null;
        this.height = null;
        this.gradientParametersIndex = 0;
        this.bakingTimer = null;
        this.isResonantRound = true;

        self.addEventListener("message", this.receiveUpdateFromMainThread.bind(this));
    }

    receiveUpdateFromMainThread(message) {
        this.width = message.data.width;
        this.height = message.data.height;
        console.info(`Message from main thread: width=${this.width}, height=${this.height}`);

        if (this.bakingTimer) {
            clearInterval(this.bakingTimer);
        }

        this.isResonantRound = true;
        this.bakeNextGradients();
        this.bakingTimer = setInterval(this.bakeNextGradients.bind(this), 3000);
    }

    /**
     * @param {ChladniParams} chladniParams
     */
    computeVibrationValues(chladniParams) {
        const M = chladniParams.m;
        const N = chladniParams.n;
        const L = chladniParams.l;

        this.vibrationValues = new Float32Array(this.width * this.height);
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const index = y * this.width + x;
                const scaledX = x / this.height * Math.PI / L;
                const scaledY = y / this.height * Math.PI / L;
                const MX = M * scaledX;
                const NX = N * scaledX;
                const MY = M * scaledY;
                const NY = N * scaledY;

                // Chladni equation
                let value = Math.cos(NX) * Math.cos(MY) - Math.cos(MX) * Math.cos(NY);

                // normalize from [-2..2] to [-1..1]
                value /= 2;

                // flip troughs to become crests (values map from [-1..1] to [0..1])
                value *= Math.sign(value);

                this.vibrationValues[index] = value;
            }
        }
    }

    computeGradients() {
        this.gradients = new Float32Array(this.width * this.height * 2);  // times 2 to store x,y values for each point
        this.gradients.fill(0);  // borders will have null gradient (to simplify both loops below)
        for (let y = 1; y < this.height - 1; y++) {
            for (let x = 1; x < this.width - 1; x++) {
                const myIndex = y * this.width + x;
                const myVibration = this.vibrationValues[myIndex];

                if (myVibration < MIN_NODE_THRESHOLD) {
                    // consider this a nodal position - just set gradient to zero
                    this.gradients[myIndex * 2] = 0;
                    this.gradients[myIndex * 2 + 1] = 0;
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

                        const ni = (y + ny) * this.width + (x + nx);
                        const nv = this.vibrationValues[ni];

                        // if neighbor has *same* vibration as minimum so far, consider it as well to avoid biasing
                        if (nv <= minVibrationSoFar) {
                            // intentionally not normalizing by length here (very expensive and useless)
                            const gx = nx;
                            const gy = ny;

                            if (nv < minVibrationSoFar) {
                                minVibrationSoFar = nv;
                                candidateGradients = [];
                            }
                            candidateGradients.push([gx, gy]);
                        }
                    }
                }

                const index = (y * this.width + x) * 2;
                const chosenGradient = candidateGradients.length === 1 ? candidateGradients[0] :
                    candidateGradients[Math.floor(Math.random() * candidateGradients.length)];  // to avoid biasing

                this.gradients[index] = chosenGradient[0];
                this.gradients[index + 1] = chosenGradient[1];
            }
        }
    }

    recalculateGradients(chladniParams) {

        let elapsed = performance.now();
        this.computeVibrationValues(chladniParams);
        elapsed = performance.now() - elapsed;
        console.info(`Vibration elapsed: ${elapsed.toFixed(0)}ms`);

        // Now that the vibration magnitude of each point in the plate was calculated, we can calculate gradients.
        // Particles are looking for nodal points (where vibration magnitude is zero), so gradients must point towards
        // the neighbor with lowest vibration.
        elapsed = performance.now();
        this.computeGradients();
        elapsed = performance.now() - elapsed;
        console.info(`Gradients elapsed: ${elapsed.toFixed(0)}ms`);
    }

    bakeNextGradients() {
        if (this.isResonantRound) {
            const start = performance.now();
            console.info("Baking gradients");
            const chladniParams = CHLADNI_PARAMS[this.gradientParametersIndex];

            // could cache results (at the expense of huge memory consumption and being unable to do zero-copy transfer)
            this.recalculateGradients(chladniParams);

            const elapsed = performance.now() - start;
            console.info(`Baking took ${elapsed.toFixed(0)}ms`);

            this.gradientParametersIndex = (this.gradientParametersIndex + 1) % CHLADNI_PARAMS.length;

            self.postMessage({
                vibrationIntensity: MODERATE_RANDOM_VIBRATION_INTENSITY,
                vibrationValues: this.vibrationValues.buffer,
                gradients: this.gradients.buffer,
            }, [this.vibrationValues.buffer, this.gradients.buffer]);  // these will be zero-copy-transferred
        } else {

            self.postMessage({
                vibrationIntensity: AGGRESSIVE_RANDOM_VIBRATION_INTENSITY,
                vibrationValues: null,
                gradients: null,
            });
        }

        this.isResonantRound = !this.isResonantRound;
    }
}

new GradientWorker();
