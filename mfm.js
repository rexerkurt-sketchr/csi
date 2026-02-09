
class MFM {
    constructor() {
        this.canvas = document.getElementById('sim-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.efcEnabled = false;
        this.externalField = 0; // -2 to 2 Tesla range
        this.chargeStrength = 0.7;

        // Config must be defined before resize()
        this.config = {
            sampleLength: 400 // grid size
        };

        this.view = { scaleX: 1, offsetY: 0 };

        // Maps will be generated in init
        this.noiseMap = null;
        this.baseMagneticMap = null;

        this.init();
    }

    init() {
        this.resize();
        this.generateMaps(this.canvas.width, this.canvas.height);

        window.addEventListener('resize', () => {
            this.resize();
            this.generateMaps(this.canvas.width, this.canvas.height);
            this.draw();
        });

        // EFC Toggle
        const btn = document.getElementById('efc-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                this.efcEnabled = !this.efcEnabled;
                this.updateUI();
                this.draw();
            });
        }

        // Field Slider
        const fieldSlider = document.getElementById('field-slider');
        const fieldVal = document.getElementById('field-val');

        if (fieldSlider && fieldVal) {
            fieldSlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.externalField = val / 50; // -2.0 to 2.0 Tesla
                const tesla = (val / 50).toFixed(2);
                fieldVal.textContent = (val > 0 ? "+" : "") + tesla + " T";
                this.draw();
            });
        }

        // Charge Slider
        const chargeSlider = document.getElementById('charge-slider');
        if (chargeSlider) {
            chargeSlider.addEventListener('input', (e) => {
                this.chargeStrength = parseInt(e.target.value) / 100;
                this.draw();
            });
        }

        // Reset Button
        const resetBtn = document.getElementById('btn-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.externalField = 0;
                if (fieldSlider) fieldSlider.value = 0;
                if (fieldVal) fieldVal.textContent = "0.00 T";
                this.draw();
            });
        }

        this.draw();
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;

        if (this.canvas.width === 0 || this.canvas.height === 0) return;

        this.view.scaleX = (this.canvas.width - 100) / this.config.sampleLength;
        this.view.offsetY = this.canvas.height - (this.canvas.height < 500 ? 50 : 100);
    }

    generateMaps(w, h) {
        // Create magnetic domain pattern
        this.baseMagneticMap = new Float32Array(w * h);
        this.noiseMap = new Float32Array(w * h);

        const scale = 0.02;
        const elecScale = 0.01;

        for (let y = 0; y < h; y += 2) {
            for (let x = 0; x < w; x += 2) {
                // Magnetic domains - alternating pattern
                const val = Math.sin(x * scale + Math.sin(y * scale)) *
                    Math.cos(y * scale * 0.5 - x * scale * 0.2);

                // Electrostatic noise
                const noise = Math.sin(x * elecScale * 2 + 50) +
                    Math.cos(y * elecScale * 3 + 20) +
                    (Math.random() * 0.5);

                const i = y * w + x;
                this.baseMagneticMap[i] = val;
                this.noiseMap[i] = noise;
            }
        }
    }

    updateUI() {
        const statusEl = document.getElementById('efc-status');
        const btnEl = document.getElementById('efc-btn');

        if (statusEl) {
            if (this.efcEnabled) {
                statusEl.textContent = 'ON (Clean)';
                statusEl.style.color = '#16a34a'; // green
            } else {
                statusEl.textContent = 'OFF (Artifacts)';
                statusEl.style.color = '#dc2626'; // red
            }
        }

        if (btnEl) {
            if (this.efcEnabled) {
                btnEl.classList.add('active');
            } else {
                btnEl.classList.remove('active');
            }
        }
    }

    draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.clearRect(0, 0, w, h);

        // Create image data for direct pixel manipulation
        const imgData = this.ctx.createImageData(w, h);
        const data = imgData.data;

        const fieldBias = this.externalField;

        for (let y = 0; y < h; y += 2) {
            for (let x = 0; x < w; x += 2) {
                const i = y * w + x;

                let magVal = this.baseMagneticMap[i] || 0;
                let noiseVal = this.noiseMap[i] || 0;

                // Apply external field (hysteresis simulation)
                let modifiedMag = magVal + fieldBias;

                // Clamp magnetic response
                if (modifiedMag > 1) modifiedMag = 1;
                if (modifiedMag < -1) modifiedMag = -1;

                // Final signal
                let signal = this.efcEnabled
                    ? modifiedMag
                    : modifiedMag + (noiseVal * this.chargeStrength);

                // Display value with clipping
                let displayVal = signal;
                if (displayVal > 1.5) displayVal = 1.5;
                if (displayVal < -1.5) displayVal = -1.5;

                // Color mapping: Orange/Red for up domains, Blue for down
                let r = 0, g = 0, b = 0;
                if (displayVal > 0) {
                    const inten = Math.min(255, displayVal * 200);
                    r = inten;
                    g = inten * 0.6;
                    b = 0;
                } else {
                    const inten = Math.min(255, Math.abs(displayVal) * 200);
                    r = 0;
                    g = inten * 0.3;
                    b = inten;
                }

                // Write 2x2 block for performance
                const idx = (y * w + x) * 4;
                data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
                data[idx + 4] = r; data[idx + 5] = g; data[idx + 6] = b; data[idx + 7] = 255;

                const idx2 = ((y + 1) * w + x) * 4;
                data[idx2] = r; data[idx2 + 1] = g; data[idx2 + 2] = b; data[idx2 + 3] = 255;
                data[idx2 + 4] = r; data[idx2 + 5] = g; data[idx2 + 6] = b; data[idx2 + 7] = 255;
            }
        }

        this.ctx.putImageData(imgData, 0, 0);

        // Draw scale bar
        this.drawScaleBar();
    }

    drawScaleBar() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Magnetic field scale
        const barX = 20;
        const barY = h - 80;
        const barH = 60;
        const barW = 30;

        const gradient = this.ctx.createLinearGradient(0, barY, 0, barY + barH);
        gradient.addColorStop(0, 'rgb(255, 150, 0)'); // Up domains
        gradient.addColorStop(0.5, 'rgb(100, 100, 100)'); // Zero
        gradient.addColorStop(1, 'rgb(0, 80, 255)'); // Down domains

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(barX, barY, barW, barH);

        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(barX, barY, barW, barH);

        // Labels
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px Inter, sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('+Mz', barX + barW + 5, barY + 10);
        this.ctx.fillText('-Mz', barX + barW + 5, barY + barH - 5);
    }
}

// Start immediately as module is deferred
new MFM();
