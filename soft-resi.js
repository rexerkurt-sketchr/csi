
export class SoftResiApp {
    constructor() {
        this.canvas = document.getElementById('sim-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.config = {
            scanSpeed: 5, // 1..10
            sampleLength: 2000
        };

        this.state = {
            isRunning: false,
            phase: 'LIFT', // LIFT, MOVE, APPROACH, MEASURE, RETRACT
            tipX: 0,
            tipZ: 50,
            surfaceZ: 0,
            force: 0,
            resistance: 0,
            measuredProfile: [],
            waitTimer: 0 // Frame counter for pauses
        };

        this.surface = [];
        this.view = { scaleX: 1, scaleY: 2, offsetX: 50, offsetY: 300 };

        this.init();
    }

    init() {
        window.addEventListener('resize', () => this.resize());
        this.resize();
        this.generateSurface();
        this.bindControls();
        this.loop();
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
        this.view.scaleX = (this.canvas.width - 100) / this.config.sampleLength;
        this.view.offsetY = this.canvas.height - 100;
    }

    generateSurface() {
        // Fragile surface with conductive islands
        this.surface = [];
        for (let x = 0; x <= this.config.sampleLength; x += 5) {
            let z = 30 + Math.sin(x * 0.02) * 10 + (Math.random() * 2);

            // Map: Insulator (12) -> Polymer (4) -> Metal (2)
            let rLog = 12; // Insulator

            // Conductive Polymer Island (Soft/Fragile but conductive)
            if (x > 500 && x < 800) rLog = 5;

            // Metallic Contact (Very conductive)
            if (x > 1200 && x < 1500) rLog = 2;

            this.surface.push({ x, z, rLog });
        }
    }

    bindControls() {
        const btnStart = document.getElementById('btn-start');
        btnStart.addEventListener('click', () => {
            this.state.isRunning = !this.state.isRunning;
            btnStart.textContent = this.state.isRunning ? "Pause" : "Start soft Scan";
        });
        document.getElementById('btn-reset').addEventListener('click', () => {
            this.state.tipX = 0;
            this.state.measuredProfile = [];
        });

        const speedSlider = document.getElementById('speed-slider');
        const speedDisplay = document.getElementById('speed-val-display');
        speedSlider.addEventListener('input', (e) => {
            let val = parseInt(e.target.value);
            this.config.scanSpeed = val;
            speedDisplay.textContent = val;
        });
    }

    getSurfaceAt(x) {
        const idx = Math.floor(x / 5);
        return this.surface[idx] || this.surface[0];
    }

    update() {
        if (!this.state.isRunning) return;

        const surf = this.getSurfaceAt(this.state.tipX);
        const contactZ = surf.z; // Exact surface contact

        // Soft IC State Machine
        switch (this.state.phase) {
            case 'LIFT':
                this.state.tipZ += 5; // Faster lift
                if (this.state.tipZ > contactZ + 50) { // Lift higher
                    this.state.phase = 'MOVE';
                }
                break;
            case 'MOVE':
                this.state.tipX += 20; // Step size
                if (this.state.tipX > this.config.sampleLength) {
                    this.state.tipX = 0;
                    this.state.measuredProfile = [];
                }
                this.state.phase = 'APPROACH';
                break;
            case 'APPROACH':
                this.state.tipZ -= 5; // Faster approach
                if (this.state.tipZ <= contactZ) {
                    this.state.tipZ = contactZ;
                    this.state.force = 1.0; // Target force reached
                    this.state.phase = 'MEASURE';
                }
                break;
            case 'MEASURE':
                // Measure R only at contact
                this.state.resistance = surf.rLog;

                // Only record once per contact
                if (this.state.waitTimer === 0) {
                    this.state.measuredProfile.push({
                        x: this.state.tipX,
                        r: this.state.resistance
                    });
                }

                // Wait logic based on speed
                // Speed 10 (Fast) -> 0 delay
                // Speed 1 (Slow) -> 30 frames delay
                const delayFrames = (10 - this.config.scanSpeed) * 3;

                this.state.waitTimer++;
                if (this.state.waitTimer > delayFrames) {
                    this.state.waitTimer = 0;
                    this.state.phase = 'RETRACT';
                }
                break;
            case 'RETRACT':
                this.state.force = 0;
                this.state.phase = 'LIFT';
                break;
        }

        // Update UI
        this.updateUI();
    }

    updateUI() {
        document.getElementById('state-text').textContent = this.state.phase;

        // Steps Highlight
        document.querySelectorAll('.step-item').forEach(el => el.classList.remove('active'));
        if (this.state.phase === 'LIFT' || this.state.phase === 'MOVE') document.getElementById('step-1').classList.add('active');
        if (this.state.phase === 'APPROACH') document.getElementById('step-2').classList.add('active');
        if (this.state.phase === 'MEASURE') document.getElementById('step-3').classList.add('active');

        // Readouts
        document.getElementById('force-val').textContent = this.state.force.toFixed(2) + " nN";
        if (this.state.phase === 'MEASURE') {
            const ohms = Math.pow(10, this.state.resistance);
            document.getElementById('res-val').textContent = ohms > 1e9 ? (ohms / 1e9).toFixed(1) + " GΩ" : (ohms / 1e3).toFixed(1) + " kΩ";
        } else {
            document.getElementById('res-val').textContent = "--";
        }
    }

    draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, w, h);

        const { scaleX, offsetY, offsetX } = this.view;
        const toScreen = (x, z) => ({ x: offsetX + x * scaleX, y: offsetY - z * 2 });

        // Surface with Heatmap Coloring
        this.ctx.beginPath();
        // this.ctx.strokeStyle = '#94a3b8'; // Removed simple stroke

        for (let i = 0; i < this.surface.length - 1; i++) {
            let p1 = this.surface[i];
            let p2 = this.surface[i + 1];
            let s1 = toScreen(p1.x, p1.z);
            let s2 = toScreen(p2.x, p2.z);

            // Same Palette as ResiScope
            let color = '#1e3a8a'; // Insulator (Default)
            if (p1.rLog < 10) color = '#7c3aed';
            if (p1.rLog < 6) color = '#f97316'; // Polymer
            if (p1.rLog < 3) color = '#facc15'; // Metal

            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 4; // Thicker line to show material property
            this.ctx.beginPath();
            this.ctx.moveTo(s1.x, s1.y);
            this.ctx.lineTo(s2.x, s2.y);
            this.ctx.stroke();
        }

        // Measured Points (Dots)
        for (let m of this.state.measuredProfile) {
            let sc = toScreen(m.x, m.r * 5 + 60); // Plot R above surface
            this.ctx.fillStyle = '#a855f7';
            this.ctx.beginPath();
            this.ctx.arc(sc.x, sc.y, 3, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Tip
        let tipSc = toScreen(this.state.tipX, this.state.tipZ);
        this.ctx.fillStyle = '#cbd5e1';
        this.ctx.beginPath();
        this.ctx.moveTo(tipSc.x, tipSc.y);
        this.ctx.lineTo(tipSc.x - 10, tipSc.y - 40);
        this.ctx.lineTo(tipSc.x + 10, tipSc.y - 40);
        this.ctx.fill();

        // Draw Value Labels for Regions
        this.ctx.font = 'bold 11px Inter';
        this.ctx.textAlign = 'center';

        const labels = [
            { x: 250, rLog: 12 }, // Insulator
            { x: 650, rLog: 5 },  // Polymer
            { x: 1350, rLog: 2 }  // Metal
        ];

        for (let lbl of labels) {
            // Check if we scanned passed this point
            // Soft Resi resets measurement on loop, so check start.measuredProfile
            // Find closest measured point
            const closest = this.state.measuredProfile.find(m => Math.abs(m.x - lbl.x) < 20);

            if (closest) {
                const ohms = Math.pow(10, lbl.rLog);
                let text = ohms > 1e9 ? (ohms / 1e9).toFixed(0) + " GΩ" : (ohms > 1e6 ? (ohms / 1e6).toFixed(0) + " MΩ" : (ohms / 1e3).toFixed(0) + " kΩ");
                if (ohms < 1e3) text = ohms.toFixed(0) + " Ω";

                let sc = toScreen(closest.x, closest.r * 5 + 60);

                // Draw Label Box
                const textWidth = this.ctx.measureText(text).width;
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.fillRect(sc.x - textWidth / 2 - 4, sc.y - 25, textWidth + 8, 16);

                this.ctx.fillStyle = '#111827';
                this.ctx.fillText(text, sc.x, sc.y - 13);
            }
        }
        this.ctx.textAlign = 'left';
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

window.onload = () => { new SoftResiApp(); };
