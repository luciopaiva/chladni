
// create canvas
const canvas = document.createElement("canvas");
const c = canvas.getContext("2d");
document.body.appendChild(canvas);

let width = window.innerWidth;
let height = window.innerHeight;

// resize canvas to cover whole screen
function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.setAttribute("width", width);
    canvas.setAttribute("height", height);
}
window.addEventListener("resize", resize);
resize();

// animation loop
function update() {
    c.clearRect(0, 0, width, height);
    c.strokeStyle = "white";
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(width, height);
    c.stroke();

    requestAnimationFrame(update);
}
update(performance.now());
