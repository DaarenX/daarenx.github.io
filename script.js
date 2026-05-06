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

// Disable Right-Click (Context Menu)
img.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Disable Dragging
img.addEventListener('dragstart', (e) => {
    e.preventDefault();
});

if (!gl) {
    throw new Error("WebGL is not available.");
}

gl.clearColor(0, 0, 0, 0);

const DROP_OFFSETS = [0, 2200, 5000, 7100, 9000, 11400, 13400, 15800, 18200, 20900];
const SOUND_DELAY_MS = 450;
const MOUSE_FOLLOW_SPEED = 8;
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

let mousePosition = [window.innerWidth * 0.5 * pixelRatio, window.innerHeight * 0.5 * pixelRatio];
let glowPosition = [mousePosition[0], mousePosition[1]];
const impactPositions = new Array(DROP_OFFSETS.length).fill([0, 0])
const impactTimes = new Array(DROP_OFFSETS.length).fill(-100);
let sequenceStarted = false;
let revealTime = -10;
let audioPrimed = false;
let lastMouseInterpolationTime = null;

function resize() {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * pixelRatio);
    canvas.height = Math.round(window.innerHeight * pixelRatio);
    gl.viewport(0, 0, canvas.width, canvas.height);
}

window.addEventListener("resize", resize);
resize();

window.addEventListener("pointermove", (event) => {
    mousePosition = [event.clientX * pixelRatio, (window.innerHeight - event.clientY) * pixelRatio];
});

async function primeDropSound() {
    if (audioPrimed) {
        return;
    }

    dropSound.muted = true;
    dropSound.currentTime = 0;

    try {
        await dropSound.play();
        dropSound.pause();
        dropSound.currentTime = 0;
        audioPrimed = true;
    } catch (_error) {
        dropSound.pause();
        dropSound.currentTime = 0;
    } finally {
        dropSound.muted = false;
    }
}

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

window.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
        return;
    }

    if (sequenceStarted) {
        return;
    }

    sequenceStarted = true;
    let position = [event.clientX * pixelRatio, (window.innerHeight - event.clientY) * pixelRatio];

    void primeDropSound();
    dropSound.currentTime = 0;

    window.setTimeout(() => {
        void dropSound.play().catch(() => {});
    }, SOUND_DELAY_MS);

    for (let index = 0; index < DROP_OFFSETS.length; index += 1) {
        playDropAt(position, DROP_OFFSETS[index], index);
        position = [
            (Math.random() * 0.5 + 0.25) * window.innerWidth * pixelRatio,
            (Math.random() * 0.5 + 0.25) * window.innerHeight * pixelRatio
        ];
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

float waterRippleField(vec2 uv, vec2 center, float now) {
    vec2 delta = uv - center;
    float dist = length(delta);
    vec2 flowUv = uv;

    flowUv.x += sin((uv.y + now * 0.18) * 26.0) * 0.005;
    flowUv.y += cos((uv.x - now * 0.14) * 22.0) * 0.005;

    float radialWave = sin(dist * 120.0 - now * 5.2);
    float crossWave = sin((flowUv.x + flowUv.y) * 42.0 + now * 2.7);
    float detailWave = cos((flowUv.x - flowUv.y) * 58.0 - now * 3.6);

    return radialWave * 0.5 + crossWave * 0.3 + detailWave * 0.2;
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
    float minDimension = min(resolution.x, resolution.y);
    vec2 uv = gl_FragCoord.xy / minDimension;
    vec2 mouseUv = mouse / minDimension;

    vec3 color = vec3(0.0);

    float cursorGlow = glow(uv, mouseUv, 0.015, 0.8);
    float cursorWaterMask = glow(uv, mouseUv, 0.04, 1.0);
    float cursorRipple = waterRippleField(uv, mouseUv, time);
    float cursorRippleBands = 0.5 + 0.5 * cursorRipple;
    color += vec3(0.72, 0.86, 1.0) * cursorGlow;
    color += vec3(0.12, 0.22, 0.3) * cursorWaterMask * 0.24;
    color += vec3(0.24, 0.42, 0.52) * cursorWaterMask * cursorRippleBands * 0.22;
    color += vec3(0.86, 0.95, 1.0) * cursorWaterMask * pow(cursorRippleBands, 3.0) * 0.12;

    float dropDuration = 0.55;
    float waveDelay = 0.02;
    float waveDuration = 22.0; // TODO just don't make them disappear

    for (int i = 0; i < 10; i += 1) {
        vec2 impactUv = impactPositions[i] / minDimension;
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
            float radius = waveElapsed * 0.15;
            float ringWidth = mix(0.012, 0.004, clamp(waveElapsed / waveDuration, 0.0, 1.0));
            float dist = distance(uv, impactUv);
            float ring = exp(-pow((dist - radius) / ringWidth, 2.0));
            float waveMask = exp(-pow(dist / (radius), 2.0));
            float waveRipple = waterRippleField(uv, impactUv, time + waveElapsed * 0.6);
            float waveRippleBands = 0.5 + 0.5 * waveRipple;
            float fade = exp(-waveElapsed * 0.75);
            float splash = glow(uv, impactUv, 0.018, 1.0) * exp(-waveElapsed * 2.0);

            color += vec3(0.45, 0.65, 1.0) * (ring * fade * 0.85 + splash * 0.45);
            color += vec3(0.12, 0.22, 0.3) * waveMask * fade * 0.12;
            color += vec3(0.24, 0.42, 0.52) * waveMask * waveRippleBands * fade * 0.16;
            color += vec3(0.86, 0.95, 1.0) * ring * fade * pow(waveRippleBands, 3.0) * 0.18;
        }
    }

    float revealElapsed = -1.0;
    if (revealTime >= 0.0) {
        revealElapsed = time - revealTime;
    }

    if (revealElapsed >= 0.0) {
        vec2 impactUv = impactPositions[9] / minDimension;
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



function interpolateGlowPosition(time) {
    if (lastMouseInterpolationTime === null) {
        glowPosition = [mousePosition[0], mousePosition[1]];
        lastMouseInterpolationTime = time;
        return;
    }

    const deltaSeconds = (time - lastMouseInterpolationTime) * 0.001;
    lastMouseInterpolationTime = time;

    const interpolationFactor = 1 - Math.exp(-MOUSE_FOLLOW_SPEED * deltaSeconds);
    glowPosition[0] += (mousePosition[0] - glowPosition[0]) * interpolationFactor;
    glowPosition[1] += (mousePosition[1] - glowPosition[1]) * interpolationFactor;
}

function render(frameTime) {
    const seconds = frameTime * 0.001;
    interpolateGlowPosition(frameTime)


    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform2f(uMouse, glowPosition[0], glowPosition[1]);
    gl.uniform1f(uTime, seconds);
    gl.uniform2fv(uImpactPositions, new Float32Array(impactPositions.flat()));
    gl.uniform1fv(uImpactTimes, new Float32Array(impactTimes));
    gl.uniform1f(uRevealTime, revealTime);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(render);
}

requestAnimationFrame(render);
