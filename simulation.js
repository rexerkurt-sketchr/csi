export class Application {
    constructor() {
        this.canvas = document.getElementById('sim-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Configuration
        this.config = {
            setpoint: 2.0, // nN
            approachSpeed: 0.8, // Slower for clarity
            liftHeight: 50, // nm relative to detected surface
            resolution: 200, // points
            sampleLength: 2000, // nm
            k_surface: 0.5, // nN/nm
            laserSensitivity: 2.5, // How much spot moves per force unit
            adhesionForce: 20.0 // nN (Pull-off force)
        };

        this.state = {
            isRunning: false,
            phase: 'LIFT', // LIFT, MOVE, APPROACH, RETRACT
            tipX: 0, // nm
            tipZ: 200, // nm (Absolute height)
            force: 0, // nN
            lastMeasuredZ: 0,
            measuredProfile: [], // Array of {x, z}
            targetX: 0
        };

        this.surface = []; // Array of {x, z}

        // Visuals
        this.view = {
            scaleX: 1,
            scaleY: 2,
            offsetX: 50,
            offsetY: 300 // Base line for z=0
        };

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.generateSurface();
        this.bindControls();
        this.loop();
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;

        // Re-calc scale to fit surface
        this.view.scaleX = (this.canvas.width - 100) / this.config.sampleLength;
        this.view.offsetY = this.canvas.height - 100;
    }

    generateSurface() {
        this.surface = [];
        for (let x = 0; x <= this.config.sampleLength; x += (this.config.sampleLength / this.config.resolution)) {
            // Complex surface: Base waves + Feature
            let z = 20 +
                10 * Math.sin(x * 0.02) +
                5 * Math.sin(x * 0.05) +
                // A "Hill"
                (x > 800 && x < 1200 ? 80 * Math.exp(-Math.pow((x - 1000) / 120, 2)) : 0) +
                // A "Trench"
                (x > 1400 && x < 1600 ? -30 * Math.exp(-Math.pow((x - 1500) / 80, 2)) : 0);

            // Add some noise
            z += (Math.random() - 0.5) * 2;

            this.surface.push({ x, z });
        }
    }

    bindControls() {
        // Buttons
        const btnStart = document.getElementById('btn-start');
        btnStart.addEventListener('click', () => {
            this.state.isRunning = !this.state.isRunning;
            btnStart.textContent = this.state.isRunning ? "Pause" : "Start Scan";
            if (this.state.isRunning) btnStart.classList.replace('btn-primary', 'btn-secondary');
            else btnStart.classList.replace('btn-secondary', 'btn-primary');
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            this.state.tipX = 0;
            this.state.tipZ = 200;
            this.state.measuredProfile = [];
            this.state.phase = 'LIFT';
            this.state.isRunning = false;
            btnStart.textContent = "Start Scan";
            btnStart.classList.replace('btn-secondary', 'btn-primary');
            this.draw(); // Force redraw
        });

        // Sliders
        const bindSlider = (id, key, displayId) => {
            const slider = document.getElementById(id);
            const display = document.getElementById(displayId);
            slider.addEventListener('input', (e) => {
                this.config[key] = parseFloat(e.target.value);
                display.textContent = this.config[key].toFixed(1);
            });
        };

        bindSlider('setpoint-slider', 'setpoint', 'setpoint-val');
        // Speed slider removed
        bindSlider('lift-slider', 'liftHeight', 'lift-val');
    }

    getSurfaceHeightAt(x) {
        // Linear interpolation
        if (x < 0 || x > this.config.sampleLength) return 0;

        // Find index
        const step = this.config.sampleLength / this.config.resolution;
        const idx = Math.floor(x / step);
        const p1 = this.surface[idx];
        const p2 = this.surface[idx + 1] || p1;

        const t = (x - p1.x) / (p2.x - p1.x);
        return p1.z + t * (p2.z - p1.z);
    }

    update() {
        if (!this.state.isRunning) return;

        // --- Physics Engine ---

        const currentSurfaceZ = this.getSurfaceHeightAt(this.state.tipX);
        const distance = this.state.tipZ - currentSurfaceZ;

        // Calculate Force (Simple Contact Model)
        // Force > 0 means Repulsion (Contact)
        if (distance < 0) {
            this.state.force = -distance * this.config.k_surface;
        } else {
            this.state.force = 0;
        }

        // State Machine
        switch (this.state.phase) {
            case 'LIFT':
                this.updateElements('LIFT', '#38bdf8'); // Blue
                // Move Z up
                this.state.tipZ += this.config.approachSpeed;
                // If high enough above LAST measured Point (or default)
                // We use lastMeasuredZ + liftHeight
                let targetZ = (this.state.lastMeasuredZ || 50) + this.config.liftHeight;
                if (this.state.tipZ >= targetZ) {
                    this.state.phase = 'MOVE';
                }
                break;

            case 'MOVE':
                this.updateElements('MOVE', '#22c55e'); // Green
                // Move X
                const stepX = this.config.sampleLength / this.config.resolution;
                this.state.targetX = this.state.tipX + stepX;

                // Instant move for "Digital" feel or smooth? Let's do smooth-ish
                this.state.tipX = this.state.targetX;

                if (this.state.tipX >= this.config.sampleLength) {
                    this.state.isRunning = false; // End of scan
                    document.getElementById('btn-start').textContent = "Restart";
                    this.state.phase = 'IDLE';
                } else {
                    // Slight delay for educational purpose? No, the slow approach is enough
                    this.state.phase = 'APPROACH';
                }
                break;

            case 'APPROACH':
                this.updateElements('APPROACH', '#fbbf24'); // Yellow
                // Move Z down
                this.state.tipZ -= this.config.approachSpeed;

                // Check Setpoint
                if (this.state.force >= this.config.setpoint) {
                    this.state.phase = 'MEASURE';
                }
                // Safety floor
                if (this.state.tipZ < -20) {
                    this.state.phase = 'LIFT'; // Abort
                }
                break;

            case 'MEASURE':
                this.updateElements('MEASURE', '#ef4444'); // Red (Contact)

                // Record Data
                if (!this.state.hasRecorded) { // Ensure only recorded once per cycle
                    this.state.lastMeasuredZ = this.state.tipZ;
                    this.state.measuredProfile.push({
                        x: this.state.tipX,
                        z: this.state.tipZ
                    });
                    this.state.hasRecorded = true;
                }

                // Dwell time? Or just switch to Retract?
                // For "Constant Force" visualization, maybe stay for a few frames?
                // Let's hold for 20 frames
                if (!this.state.dwellCounter) this.state.dwellCounter = 0;
                this.state.dwellCounter++;

                if (this.state.dwellCounter > 20) {
                    this.state.dwellCounter = 0;
                    this.state.hasRecorded = false; // Reset for next
                    this.state.phase = 'RETRACT';
                }
                break;

            case 'RETRACT':
                this.updateElements('RETRACT', '#ec4899'); // Pink (Adhesion)
                // Pull up
                this.state.tipZ += this.config.approachSpeed;

                // ADHESION PHYSICS
                // If we are close to surface, force is NEGATIVE (attractive)
                // Force = -k * (distance) ? No, simpler model:
                // Force = -Adhesion if Distance < PullOffDistance
                // Distance is tipZ - surfaceZ
                const distR = this.state.tipZ - this.getSurfaceHeightAt(this.state.tipX);

                if (distR < 10) { // arbitrary pull-off range
                    // Simulate "Sticky" negative force
                    // Make it look like the tip is being pulled down
                    this.state.force = -this.config.adhesionForce * (1 - distR / 10);
                } else {
                    this.state.force = 0;
                    this.state.phase = 'LIFT'; // Done retraction
                }
                break;
        }

        // Update UI Readouts
        document.getElementById('z-pos-val').textContent = this.state.tipZ.toFixed(2) + ' nm';
        document.getElementById('force-val').textContent = this.state.force.toFixed(2) + ' nN';
    }

    updateElements(text, color) {
        document.getElementById('state-text').textContent = text;
        document.getElementById('state-bead').style.backgroundColor = color;
        document.getElementById('state-bead').style.boxShadow = `0 0 10px ${color}`;

        // Educational List Active State Logic
        // Remove all active classes
        [1, 2, 3, 4].forEach(i => document.getElementById(`step-${i}`).classList.remove('active'));

        switch (text) {
            case 'APPROACH':
                // Step 1: Topography (Contact Detection Phase)
                document.getElementById('step-1').classList.add('active');
                break;
            case 'MEASURE':
                // Step 2: Constant Force
                document.getElementById('step-2').classList.add('active');
                break;
            case 'RETRACT':
                // Step 3: Adhesion
                document.getElementById('step-3').classList.add('active');
                break;
            case 'LIFT':
            case 'MOVE':
                // Step 4: Next Point
                document.getElementById('step-4').classList.add('active');
                break;
        }
    }

    draw() {
        // Clear
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        // Fill Background
        this.ctx.fillStyle = '#f1f5f9'; // Metal/Light Gray matching CSS
        this.ctx.fillRect(0, 0, w, h);

        const { scaleX, offsetY, offsetX, scaleY } = this.view;

        // Helper: Model to Screen
        const toScreen = (x, z) => {
            return {
                x: offsetX + x * scaleX,
                y: offsetY - z * scaleY
            };
        };

        // 1. Draw Surface (Filled Gradient)
        this.ctx.beginPath();
        this.ctx.moveTo(offsetX, offsetY); // Bottom Left (Ground)
        for (let p of this.surface) {
            const sc = toScreen(p.x, p.z);
            this.ctx.lineTo(sc.x, sc.y);
        }
        this.ctx.lineTo(offsetX + this.config.sampleLength * scaleX, offsetY); // Bottom Right
        this.ctx.closePath();

        const gradient = this.ctx.createLinearGradient(0, offsetY - 200, 0, offsetY);
        gradient.addColorStop(0, '#d1d5db'); // Light Gray (Top)
        gradient.addColorStop(1, '#94a3b8'); // Darker Gray (Bottom)
        this.ctx.fillStyle = gradient;
        this.ctx.fill();

        this.ctx.strokeStyle = '#64748b'; // Slate 500
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // 2. Draw Measured Trace (The accumulated line)
        if (this.state.measuredProfile.length > 0) {
            this.ctx.beginPath();
            // Start from first point
            let first = this.state.measuredProfile[0];
            let startSc = toScreen(first.x, first.z);
            this.ctx.moveTo(startSc.x, startSc.y);

            for (let p of this.state.measuredProfile) {
                let sc = toScreen(p.x, p.z);
                this.ctx.lineTo(sc.x, sc.y);
            }
            this.ctx.strokeStyle = '#0284c7'; // Professional Blue
            this.ctx.lineWidth = 3;
            // this.ctx.setLineDash([5, 5]); // Dashed to distinguish
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // 3. Draw Advanced Cantilever & Laser System

        // Positions
        const tipSc = toScreen(this.state.tipX, this.state.tipZ);

        // CANTILEVER VISUALS
        // Geometry: V-Shape Cantilever
        const beamLen = 120;

        this.ctx.save();
        this.ctx.translate(tipSc.x, tipSc.y);

        // Draw Tip (Pyramid)
        this.ctx.beginPath();
        this.ctx.fillStyle = '#cbd5e1'; // Slate 300
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(-10, -25);
        this.ctx.lineTo(10, -25);
        this.ctx.fill();

        // Draw Triangular Cantilever (V-Shape from bottom)
        this.ctx.beginPath();
        this.ctx.fillStyle = '#94a3b8'; // Slate 400
        this.ctx.moveTo(-10, -25); // Tip connection L
        this.ctx.lineTo(10, -25);  // Tip connection R
        this.ctx.lineTo(-130, -55); // Top Back
        this.ctx.lineTo(-130, -75); // Bottom Back
        this.ctx.fill();

        // Draw Chip (Holder)
        this.ctx.fillStyle = '#64748b'; // Slate 500
        this.ctx.fillRect(-160, -90, 40, 60);

        this.ctx.restore();

        // OPTICAL LEVER (LASER + PHOTODIODE)

        // Laser Source (Fixed relative to the Head/Chip)
        const chipOffset = { x: -140, y: -80 }; // relative to tipSc
        const laserSource = {
            x: tipSc.x + chipOffset.x,
            y: tipSc.y + chipOffset.y - 100 // High above chip
        };

        // Reflection Point (Back of cantilever, above tip)
        const reflectPt = { x: tipSc.x, y: tipSc.y - 25 };

        // Photodiode Location (Fixed relative to Head)
        const detectorCenter = {
            x: tipSc.x + 80,
            y: laserSource.y
        };

        // Draw Laser Housing
        this.ctx.fillStyle = '#475569';
        this.ctx.fillRect(laserSource.x - 10, laserSource.y - 20, 20, 40);

        // Draw Detector Housing
        this.ctx.fillStyle = '#1e293b';
        this.ctx.strokeStyle = '#94a3b8';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(detectorCenter.x, detectorCenter.y, 30, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();

        // Detector Quadrants
        this.ctx.beginPath();
        this.ctx.moveTo(detectorCenter.x, detectorCenter.y - 30);
        this.ctx.lineTo(detectorCenter.x, detectorCenter.y + 30);
        this.ctx.moveTo(detectorCenter.x - 30, detectorCenter.y);
        this.ctx.lineTo(detectorCenter.x + 30, detectorCenter.y);
        this.ctx.stroke();

        // Calculate Spot Position based on Force
        // Force bends cantilever -> changes reflection angle.
        // Force > 0 (Upward bend) -> Spot moves UP.
        const spotY = detectorCenter.y - (this.state.force * this.config.laserSensitivity * 2);
        const clampedSpotY = Math.max(detectorCenter.y - 28, Math.min(detectorCenter.y + 28, spotY));

        // Draw Laser Beam
        this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)'; // Red laser
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(laserSource.x, laserSource.y);
        this.ctx.lineTo(reflectPt.x, reflectPt.y); // Incident
        this.ctx.lineTo(detectorCenter.x, clampedSpotY); // Reflected
        this.ctx.stroke();

        // Draw Laser Spot on Detector
        this.ctx.fillStyle = '#ef4444';
        this.ctx.beginPath();
        this.ctx.arc(detectorCenter.x, clampedSpotY, 4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#ef4444';
        this.ctx.fill();
        this.ctx.shadowBlur = 0;


        // Highlight contact point on surface
        if (this.state.force > 0) {
            this.ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
            this.ctx.beginPath();
            this.ctx.arc(tipSc.x, tipSc.y, 10, 0, Math.PI * 2);
            this.ctx.fill();
        } else {
            // "No Friction" Icon if in MOVE phase (and not touching)
            if (this.state.phase === 'MOVE') {
                this.ctx.font = 'bold 16px "Inter", sans-serif';
                this.ctx.fillStyle = '#22c55e'; // Success Green
                this.ctx.fillText("✓ No Friction", tipSc.x - 40, tipSc.y - 120);

                // Draw a little "floating" indicator
                this.ctx.strokeStyle = '#22c55e';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.moveTo(tipSc.x - 10, tipSc.y + 10);
                this.ctx.lineTo(tipSc.x + 10, tipSc.y + 10);
                this.ctx.stroke();
            }
        }

        // Draw Force Bar (near tip) - kept for clarity
        if (this.state.force > 0) {
            this.ctx.fillStyle = '#ef4444';
            const h = this.state.force * 10;
            this.ctx.fillRect(tipSc.x + 20, tipSc.y - h, 5, h);
        }

        // F-Z Curve visualization removed per user request

    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

// Start the app
window.onload = () => {
    window.app = new Application();
};
