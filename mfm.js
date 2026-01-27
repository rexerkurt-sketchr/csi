
export class MFM {
    constructor() {
        this.canvas = document.getElementById('sim-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.efcEnabled = false;

        // Simulation Parameters
        this.externalField = 0; // -1 to 1 range
        this.chargeStrength = 0.7;

        // Generate Static Noise Map once for consistency
        this.noiseMap = null;
        this.baseMagneticMap = null;

        this.init();
    }

    init() {
        this.resize(); // sets width/height
        this.generateMaps(this.canvas.width, this.canvas.height);

        window.addEventListener('resize', () => {
            this.resize();
            this.generateMaps(this.canvas.width, this.canvas.height);
            this.draw();
        });

        // EFC Toggle
        const btn = document.getElementById('efc-btn');
        btn.addEventListener('click', () => {
            this.efcEnabled = !this.efcEnabled;
            this.updateUI();
            this.draw();
        });

        // Field Slider
        const fieldSlider = document.getElementById('field-slider');
        const fieldVal = document.getElementById('field-val');

        fieldSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            this.externalField = val / 50; // -2.0 to 2.0 approx logic

            // UI text
            const tesla = (val / 50).toFixed(2);
            fieldVal.textContent = (val > 0 ? "+" : "") + tesla + " T";

            this.draw();
        });

        document.getElementById('charge-slider').addEventListener('input', (e) => {
            this.chargeStrength = parseInt(e.target.value) / 100;
            this.draw();
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            fieldSlider.value = 0;
            fieldVal.textContent = "0.00 T";
            this.externalField = 0;
            this.draw();
        });

        this.draw();
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
    }

    generateMaps(w, h) {
        // Pre-compute basic domain structure (Maze pattern) to make it static
        // and a noise map for artifacts

        this.baseMagneticMap = new Float32Array(w * h);
        this.noiseMap = new Float32Array(w * h);

        const scale = 0.02;
        const elecScale = 0.01;

        for (let y = 0; y < h; y += 2) { // Skip lines for speed if needed, or fill all
            for (let x = 0; x < w; x += 2) {
                // Magnetic: Maze
                // Use some sin/cos interference
                const val = Math.sin(x * scale + Math.sin(y * scale)) * Math.cos(y * scale * 0.5 - x * scale * 0.2);

                // Noise: Random blobs
                const noise = Math.sin(x * elecScale * 2 + 50) + Math.cos(y * elecScale * 3 + 20) + (Math.random() * 0.5);

                // Fill 2x2 blocks
                const i = y * w + x;
                this.baseMagneticMap[i] = val;
                this.noiseMap[i] = noise;
            }
        }
    }

    updateUI() {
        const btn = document.getElementById('efc-btn');
        const status = document.getElementById('efc-status');

        if (this.efcEnabled) {
            btn.classList.add('active');
            status.textContent = "ON (Clean)";
            status.style.color = "#16a34a";
        } else {
            btn.classList.remove('active');
            status.textContent = "OFF (Artifacts)";
            status.style.color = "#dc2626";
        }
    }

    draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.clearRect(0, 0, w, h);

        // Render loop
        // We iterate and modify the base map based on external field

        const imgData = this.ctx.createImageData(w, h);
        const data = imgData.data;

        // Optimization: Render lower res or blocky if too slow, but direct pixel manip is fast enough for 1080p usually
        // Actually, let's do 2x2 blocks manually in loop to save cycles

        const fieldBias = this.externalField; // -2 to 2

        for (let y = 0; y < h; y += 2) {
            for (let x = 0; x < w; x += 2) {
                const i = y * w + x; // Index in our maps

                let magVal = this.baseMagneticMap[i] || 0;
                let noiseVal = this.noiseMap[i] || 0;

                // Apply Field Effect (Hysteresis-ish)
                // If field is positive, it pushes values up.
                // If field is negative, it pushes values down.
                // Saturation at -1 and 1

                let modifiedMag = magVal + fieldBias;
                // Creating domains growing:
                // Soft domains flip easily. 
                // Let's just create a hard shift

                // Clamp
                if (modifiedMag > 1) modifiedMag = 1;
                if (modifiedMag < -1) modifiedMag = -1;

                // Final signal compositing
                let signal = 0;
                if (this.efcEnabled) {
                    signal = modifiedMag;
                } else {
                    // Mix in noise
                    // Noise is always positive-ish (dust charge) or random
                    signal = modifiedMag + (noiseVal * this.chargeStrength);
                }

                // Color Map: Blue (-1) -> Black (0) -> Orange/Red (+1)
                // Normalize for display where signal can be >1 due to noise
                let displayVal = signal;
                if (displayVal > 1.5) displayVal = 1.5;
                if (displayVal < -1.5) displayVal = -1.5;

                let r = 0, g = 0, b = 0;

                if (displayVal > 0) {
                    // Orange/Red for Up
                    const inten = Math.min(255, displayVal * 200);
                    r = inten;
                    g = inten * 0.6;
                    b = 0;
                } else {
                    // Blue for Down
                    const inten = Math.min(255, Math.abs(displayVal) * 200);
                    r = 0;
                    g = inten * 0.3; // dark blueish
                    b = inten;
                }

                // Draw 2x2 block
                const idx = (y * w + x) * 4;
                // Top Left
                data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
                // Top Right
                data[idx + 4] = r; data[idx + 5] = g; data[idx + 6] = b; data[idx + 7] = 255;
                // Bottom Left
                const idx2 = ((y + 1) * w + x) * 4;
                data[idx2] = r; data[idx2 + 1] = g; data[idx2 + 2] = b; data[idx2 + 3] = 255;
                // Bottom Right
                data[idx2 + 4] = r; data[idx2 + 5] = g; data[idx2 + 6] = b; data[idx2 + 7] = 255;
            }
        }

        this.ctx.putImageData(imgData, 0, 0);

        // Field Overlay Arrow
        if (Math.abs(fieldBias) > 0.1) {
            const cx = w / 2;
            const cy = h / 2;

            this.ctx.save();
            this.ctx.textAlign = 'center';
            this.ctx.font = 'bold 24px Inter';
            this.ctx.fillStyle = 'rgba(255,255,255, 0.8)';
            this.ctx.fillText(`Applied Field: ${fieldBias > 0 ? "UP" : "DOWN"}`, cx, cy);

            // Draw huge arrow
            this.ctx.strokeStyle = 'rgba(255,255,255, 0.3)';
            this.ctx.lineWidth = 10;
            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy + 50);
            this.ctx.lineTo(cx, cy - 50);
            if (fieldBias > 0) { // UP
                this.ctx.lineTo(cx - 20, cy - 30);
                this.ctx.moveTo(cx, cy - 50);
                this.ctx.lineTo(cx + 20, cy - 30);
            } else { // DOWN
                this.ctx.moveTo(cx, cy + 50);
                this.ctx.lineTo(cx - 20, cy + 30);
                this.ctx.moveTo(cx, cy + 50);
                this.ctx.lineTo(cx + 20, cy + 30);
            }
            this.ctx.stroke();
            this.ctx.restore();
        }
    }
}

window.onload = () => { new MFM(); };
