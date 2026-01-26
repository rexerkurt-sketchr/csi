export class SpectrumAnalyzer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
    }

    draw() {
        const w = this.width;
        const h = this.height;
        this.ctx.clearRect(0, 0, w, h);

        // Axes
        this.ctx.strokeStyle = '#475569';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(30, h - 20);
        this.ctx.lineTo(w - 10, h - 20); // X axis
        this.ctx.moveTo(30, h - 20);
        this.ctx.lineTo(30, 10); // Y axis
        this.ctx.stroke();

        // Labels
        this.ctx.fillStyle = '#1e293b'; // Dark Text
        this.ctx.font = '9px Inter';
        this.ctx.fillText("Freq (kHz)", w - 50, h - 5);
        this.ctx.fillText("Amp", 5, 20);

        this.ctx.save();
        this.ctx.translate(30, h - 20);

        // Helper to draw peak
        const drawPeak = (x, height, color, label) => {
            this.ctx.fillStyle = color;
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;

            this.ctx.beginPath();
            // Gaussian shape
            for (let i = -20; i <= 20; i++) {
                let y = height * Math.exp(-(i * i) / 30);
                this.ctx.lineTo(x + i, -y);
            }
            this.ctx.stroke();

            // Label
            this.ctx.fillStyle = '#475569'; // Label Text
            this.ctx.fillText(label, x - 10, -height - 5);

            // Arrow
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, -height);
            this.ctx.setLineDash([2, 2]);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        };

        // F1 (Topography) ~ 70kHz (at x=50)
        drawPeak(50, 60, '#94a3b8', 'f1 (Topo)'); // Darker Gray

        // F2 (Electrical) ~ 400kHz (at x=200)
        drawPeak(200, 90, '#eab308', 'f2 (Elec)'); // Higher Q means taller/sharper?

        this.ctx.restore();
    }
}
