const titles = [
    "𓀀 𓁐 𓁛 𓁼 𓄿 𓆄 𓆑 𓆟 𓆣 𓆭 𓈝 𓊝",
    "water",
    "drip drip",
    "daaren.xyz"
];

document.title = titles[Math.floor(Math.random() * titles.length)];

const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl");
const dropSound = document.getElementById("dropSound");
const siteContent = document.getElementById("siteContent");
const img = document.getElementById('funnygif');

// 1. Disable Right-Click (Context Menu)
img.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// 2. Disable Dragging
img.addEventListener('dragstart', (e) => {
    e.preventDefault();
});

if (!gl) {
    throw new Error("WebGL is not available.");
}

gl.clearColor(0, 0, 0, 0);

const DROP_OFFSETS = [0, 2200, 5000, 7100, 9000, 11400, 13400, 15800, 18200, 20900];

// TODO mouse and Impact Positions
let mouse = [- window.innerWidth, 0];
const impactPositions = new Array(DROP_OFFSETS.length).fill([0, 0])
const impactTimes = new Array(DROP_OFFSETS.length).fill(-10);
let sequenceStarted = false;
let revealTime = -10;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}

window.addEventListener("resize", resize);
resize();

window.addEventListener("mousemove", (event) => {
    mouse = [event.clientX, canvas.height - event.clientY];
});

function playDropAt(position, whenSeconds, index) {
    window.setTimeout(() => {
        const triggerTime = performance.now() * 0.001;
        impactPositions[index] = [position[0], position[1]];
        impactTimes[index] = triggerTime;

        // TODO absolutely extract this
        if (index === DROP_OFFSETS.length - 1) {
            revealTime = triggerTime + 0.6;
            window.setTimeout(() => {
                siteContent.classList.add("is-visible");
            }, 500);
            window.setTimeout(() => {
                window.location.assign("/cheesse");
            }, 1000);

        }

    }, whenSeconds);
}

window.addEventListener("click", (event) => {
    if (sequenceStarted) {
        return;
    }

    sequenceStarted = true;
    let position = [event.clientX, canvas.height - event.clientY];
    dropSound.currentTime = 0;

    window.setTimeout(() => {
        void dropSound.play().catch(() => {});
    }, 450);



    for (let index = 0; index < DROP_OFFSETS.length; index += 1) {
        playDropAt(position, DROP_OFFSETS[index], index);
        position = [(Math.random() * 0.5 + 0.25) * window.innerWidth, (Math.random() * 0.5 + 0.25) * window.innerHeight]
    }
});

function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(log || "Shader compilation failed.");
    }

    return shader;
}

function createProgram(vertexSource, fragmentSource) {
    const program = gl.createProgram();
    const vertexShader = createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(log || "Program linking failed.");
    }

    return program;
}

const vertexShader = `
attribute vec2 position;

void main() {
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform vec2 resolution;
uniform vec2 mouse;
uniform float time;
uniform vec2 impactPositions[10];
uniform float impactTimes[10];
uniform float revealTime;

float glow(vec2 uv, vec2 center, float radius, float strength) {
    float d = distance(uv, center);
    return strength * exp(-pow(d / radius, 2.0));
}

float ringWave(vec2 uv, vec2 center, float startTime, float now, float speed, float width, float decay) {
    float elapsed = now - startTime;
    if (elapsed < 0.0) {
        return 0.0;
    }

    float radius = elapsed * speed;
    float dist = distance(uv, center);
    float ring = exp(-pow((dist - radius) / width, 2.0));
    return ring * exp(-elapsed * decay);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 mouseUv = mouse / resolution;

    vec3 color = vec3(0.0);

    float cursorGlow = glow(uv, mouseUv, 0.05, 0.28);
    color += vec3(0.72, 0.86, 1.0) * cursorGlow;

    float dropDuration = 0.55;
    float waveDelay = 0.02;
    float waveDuration = 2.8;

    for (int i = 0; i < 10; i += 1) {
        vec2 impactUv = impactPositions[i] / resolution;
        float elapsed = time - impactTimes[i];

        if (elapsed < 0.0 || elapsed >= dropDuration + waveDuration) {
            continue;
        }

        float dropProgress = clamp(elapsed / dropDuration, 0.0, 1.0);
        float easedDrop = 1.0 - pow(1.0 - dropProgress, 3.0);
        vec2 dropUv = vec2(impactUv.x, mix(impactUv.y + 0.26, impactUv.y, easedDrop));
        float droplet = glow(uv, dropUv, 0.012, 1.0);

        if (elapsed <= dropDuration) {
            color += vec3(0.45, 0.65, 1.0) * (droplet * 0.9);
        }

        float waveElapsed = elapsed - dropDuration - waveDelay;
        if (waveElapsed >= 0.0) {
            float radius = waveElapsed * 0.34;
            float ringWidth = mix(0.012, 0.004, clamp(waveElapsed / waveDuration, 0.0, 1.0));
            float dist = distance(uv, impactUv);
            float ring = exp(-pow((dist - radius) / ringWidth, 2.0));
            float fade = exp(-waveElapsed * 1.35);
            float splash = glow(uv, impactUv, 0.018, 1.0) * exp(-waveElapsed * 8.0);

            color += vec3(0.55, 0.75, 1.0) * (ring * fade * 0.85 + splash * 0.45);
        }
    }

    float revealElapsed = -1.0;
    if (revealTime >= 0.0) {
        revealElapsed = time - revealTime;
    }

    if (revealElapsed >= 0.0) {
        vec2 impactUv = impactPositions[9] / resolution;
        float washRadius = revealElapsed * 0.52;
        float dist = distance(uv, impactUv);
        float wash = smoothstep(washRadius - 0.12, washRadius + 0.04, dist);
        float revealRing = ringWave(uv, impactUv, revealTime, time, 0.48, 0.02, 0.55);
        float revealCore = glow(uv, impactUv, 0.06 + revealElapsed * 0.01, 1.0) * exp(-revealElapsed * 0.65);

        color = mix(vec3(1.0), color, wash);
        color += vec3(1.0) * (revealRing * 0.25 + revealCore * 0.12);
    }

    float overlayFade = 1.0;
    if (revealElapsed >= 0.0) {
        overlayFade = clamp(1.0 - smoothstep(0.3, 2.6, revealElapsed), 0.0, 1.0);
    }

    gl_FragColor = vec4(color, overlayFade);
}
`;

const program = createProgram(vertexShader, fragmentShader);
gl.useProgram(program);

const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        1, 1,
    ]),
    gl.STATIC_DRAW
);

const position = gl.getAttribLocation(program, "position");
gl.enableVertexAttribArray(position);
gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

const uResolution = gl.getUniformLocation(program, "resolution");
const uMouse = gl.getUniformLocation(program, "mouse");
const uTime = gl.getUniformLocation(program, "time");
const uImpactPositions = gl.getUniformLocation(program, "impactPositions");
const uImpactTimes = gl.getUniformLocation(program, "impactTimes");
const uRevealTime = gl.getUniformLocation(program, "revealTime");

function render(frameTime) {
    const seconds = frameTime * 0.001;

    gl.clear(gl.COLOR_BUFFER_BIT);
    const resolution = Math.max(canvas.width, canvas.height)
    gl.uniform2f(uResolution, resolution, resolution);
    gl.uniform2f(uMouse, mouse[0], mouse[1]);
    gl.uniform1f(uTime, seconds);
    gl.uniform2fv(uImpactPositions, new Float32Array(impactPositions.flat()));
    gl.uniform1fv(uImpactTimes, new Float32Array(impactTimes));
    gl.uniform1f(uRevealTime, revealTime);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(render);
}

requestAnimationFrame(render);
