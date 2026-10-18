import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BASE = new URL('./', import.meta.url).href; // thư mục assets/
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const loader = new STLLoader();
const cache = {};
const loadGeo = url => cache[url] ??= new Promise((res, rej) => loader.load(url, res, undefined, rej));
const plastic = (color, rough = .5) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: .3, clearcoatRoughness: .6 });
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, ...o });

function makeRenderer(el, alpha = true) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha });
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  el.prepend(r.domElement); return r;
}
function litScene(renderer) {
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 5, 4); scene.add(key);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, .5));
  return scene;
}
function autoSize(el, renderer, camera) {
  const f = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  new ResizeObserver(f).observe(el); f();
}
function onScreen(el) { const s = { v: true }; new IntersectionObserver(([e]) => { s.v = e.isIntersecting; }).observe(el); return s; }
function fit(camera, object, pad = 1.2, dir = [.55, .38, .74]) {
  const sphere = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
  const dist = sphere.radius * pad / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(sphere.center.x + dist * dir[0], sphere.center.y + dist * dir[1], sphere.center.z + dist * dir[2]);
  camera.near = dist / 60; camera.far = dist * 20; camera.updateProjectionMatrix();
  return sphere.center;
}
function labelTex(lines, w = 512, h = 256, bg = '#1d1d1f', fg = '#f5f5f7') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([txt, size, y, color]) => { g.font = `600 ${size}px Inter, Arial, sans-serif`; g.fillStyle = color || fg; g.fillText(txt, w / 2, y); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
async function svgTexture(url, size = 1024) {
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/* ---------- STL viewers ---------- */
const SCENES = {
  'v-link':   [{ src: BASE + 'models/link-duc.stl', color: '#1A9FE0' }, { src: BASE + 'models/link-cai.stl', color: '#f2f2f4' }],
  'v-ctrl':   [{ src: BASE + 'models/controller-top.stl', color: '#e9e9ec', rough: .7, rx: 0 }],
  'v-lego':   [{ src: BASE + 'models/lego-servo.stl', color: '#ff9f0a', rx: 0 }, { src: BASE + 'models/lego-wheel.stl', color: '#0a72d6', rx: 0 }, { src: BASE + 'models/lego-cross.stl', color: '#34c759', rx: 0 }],
  'v-gimbal': [{ src: BASE + 'models/gimbal-ring.stl', color: '#5e5ce6' }, { src: BASE + 'models/gimbal-base.stl', color: '#3a3a3c', rough: .6 }],
  'v-m3d': [
    { src: BASE + 'models/lego-servo.stl', color: '#ff9f0a', rx: 0 }, { src: BASE + 'models/lego-servo-top.stl', color: '#ffb340', rx: 0 },
    { src: BASE + 'models/lego-wheel.stl', color: '#0a72d6', rx: 0 }, { src: BASE + 'models/lego-cross.stl', color: '#34c759', rx: 0 },
    { src: BASE + 'models/gimbal-ring.stl', color: '#5e5ce6' }, { src: BASE + 'models/gimbal-base.stl', color: '#3a3a3c', rough: .6 },
    { src: BASE + 'models/drone-v1-b.stl', color: '#1A9FE0', rough: .45 }, { src: BASE + 'models/drone-v1-a.stl', color: '#eef0f3', rough: .55 },
    { src: BASE + 'models/taycam-tren.stl', color: '#1A9FE0', rough: .45 }, { src: BASE + 'models/taycam-duoi.stl', color: '#2c2c2e', rough: .6 }
  ]
};
async function initViewer(el) {
  const list = SCENES[el.id], mode = el.dataset.mode;
  const renderer = makeRenderer(el), scene = litScene(renderer);
  const camera = new THREE.PerspectiveCamera(28, 1, .1, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = true;
  controls.autoRotate = !reduced; controls.autoRotateSpeed = 1.2;
  const geos = await Promise.all(list.map(m => loadGeo(m.src)));
  const root = new THREE.Group(); root.rotation.x = -Math.PI / 2; scene.add(root);
  const meshes = geos.map((g, i) => new THREE.Mesh(g, plastic(list[i].color, list[i].rough)));
  let tick = () => {};
  if (mode === 'snap') {
    const [male, female] = meshes; female.rotation.z = Math.PI; root.add(male, female);
    controls.target.copy(fit(camera, root, 1.05));
    const gapAt = t => { if (t < 1.2) return 9; if (t < 1.7) { const q = (t - 1.2) / .5; return 9 * (1 - q * q * q); } if (t < 3.4) return 0; const q = (t - 3.4) / .8; return 9 * q * q * (3 - 2 * q); };
    let t0 = reduced ? -1 : performance.now();
    tick = now => {
      let t = t0 < 0 ? 0 : (now - t0) / 1000;
      t = reduced ? Math.min(t, 3) : t % 4.2;
      const gap = gapAt(t); male.position.y = gap / 2 + .02; female.position.y = -gap / 2 - .02;
    };
    document.getElementById('snapBtn').addEventListener('click', () => { t0 = performance.now(); if (window.HXA?.ensure()) setTimeout(() => window.HXA.sfx.snap(), 1650); });
  } else {
    const holder = new THREE.Group(); root.add(holder);
    const show = i => {
      holder.clear(); const m = meshes[i]; m.geometry.computeBoundingBox();
      const c = m.geometry.boundingBox.getCenter(new THREE.Vector3()); m.position.set(-c.x, -c.y, -c.z);
      root.rotation.x = list[i].rx ?? -Math.PI / 2; holder.add(m); controls.target.copy(fit(camera, root, 1.1));
    };
    show(0);
    const tile = el.closest('.tile, .modal');
    tile?.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { show(+b.dataset.i); tile.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
    if (el.dataset.start) tile?.querySelector(`.tabs button[data-i="${el.dataset.start}"]`)?.click();
  }
  autoSize(el, renderer, camera);
  const vis = onScreen(el);
  renderer.setAnimationLoop(now => { if (!vis.v) return; tick(now); controls.update(); renderer.render(scene, camera); });
  el.classList.add('ready');
}

/* ---------- HiNex Drone V1: dựng từ chính bo mạch ---------- */
async function buildDrone() {
  // HiNex Drone V1 bản mới: khung lồng bảo vệ in 3D (hệ tọa độ bay: +X trước, Z lên, đơn vị mm)
  const drone = new THREE.Group();
  const body = new THREE.Group(); body.scale.setScalar(.001); drone.add(body);
  const frame = new THREE.Group(); frame.rotation.set(-Math.PI / 2, 0, 0); // Z lên -> Y lên
  const yawFix = new THREE.Group(); yawFix.rotation.y = Math.PI / 2; yawFix.add(frame); body.add(yawFix); // +X trước -> -Z trước
  const [gA, gB] = await Promise.all([loadGeo(BASE + 'models/drone-v1-a.stl'), loadGeo(BASE + 'models/drone-v1-b.stl')]);
  frame.add(new THREE.Mesh(gA, plastic('#eef0f3', .55)), new THREE.Mesh(gB, plastic('#1A9FE0', .45)));
  const metal = std('#b8bcc4', { metalness: .8, roughness: .3 });
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); frame.add(mesh); return mesh; };
  // motor coreless 1020 (Ø10 × 20 mm), đỉnh vỏ ở z = 2
  const props = [];
  [[39, 39, 1], [-39, 39, -1], [-39, -39, 1], [39, -39, -1]].forEach(([x, y, dir]) => {
    const mot = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 20, 24), metal); mot.rotation.x = Math.PI / 2; add(mot, x, y, -8);
    const hub = new THREE.Group(); hub.position.set(x, y, 5.2); frame.add(hub);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(64, 5.5, .9), std(dir > 0 ? '#ff9f0a' : '#f5f5f7', { roughness: .4 })); blade.rotation.x = .18 * dir; hub.add(blade);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 3, 16), std('#26272b')); cap.rotation.x = Math.PI / 2; hub.add(cap);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(32, 40), new THREE.MeshBasicMaterial({ color: dir > 0 ? '#ffb340' : '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    hub.add(disc);
    props.push({ hub, blade, disc, dir, axis: 'z' });
  });
  // bo mạch 36 × 36 mm (ESP32-C3 SuperMini + GY-91) trên đệm 5 mm, mặt dưới z = 17,9
  const boardTex = labelTex([['HiNex Drone V1', 58, 92], ['ESP32-C3 · GY-91', 40, 160, '#8fd6fa']], 512, 256, '#14171c');
  const board = new THREE.Mesh(new THREE.BoxGeometry(36, 36, 1.6), [std('#14171c'), std('#14171c'), std('#14171c'), std('#14171c'), std('#fff', { map: boardTex }), std('#14171c')]);
  add(board, 0, 0, 18.7);
  const mcu = new THREE.Mesh(new THREE.BoxGeometry(18, 22.5, 3), std('#1d1d1f')); add(mcu, -6, 0, 21);
  const imu = new THREE.Mesh(new THREE.BoxGeometry(12, 14, 2), std('#5e2ca5')); add(imu, 11, 0, 20.5);
  [[-10, -10], [10, -10], [-10, 10], [10, 10]].forEach(([x, y]) => { const sp = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 5, 12), std('#d6d9de')); sp.rotation.x = Math.PI / 2; add(sp, x, y, 15.4); });
  // pin LiPo 1S 55 × 36 × 11 mm dưới khung
  const batTex = labelTex([['LiPo 1S', 70, 128]], 512, 256, '#2c4a7a');
  const bat = new THREE.Mesh(new THREE.BoxGeometry(55, 36, 11), [std('#2c4a7a'), std('#2c4a7a'), std('#2c4a7a'), std('#2c4a7a'), std('#2c4a7a'), std('#fff', { map: batTex })]);
  add(bat, 0, 0, -9);
  const ledF = new THREE.Mesh(new THREE.SphereGeometry(1.6), new THREE.MeshBasicMaterial({ color: '#3a3a3c' })); add(ledF, 18.5, 0, 20);
  const ledB = new THREE.Mesh(new THREE.SphereGeometry(1.6), new THREE.MeshBasicMaterial({ color: '#ff453a' })); add(ledB, -18.5, 0, 20);
  // đặt đáy chân đáp (z = -18,8) chạm mặt đất
  body.position.y = .0188;
  return { drone, props, ledF };
}
async function initDroneShow(el) {
  const renderer = makeRenderer(el), scene = litScene(renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, .001, 10);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = true; controls.autoRotate = !reduced; controls.autoRotateSpeed = 1;
  const { drone, props } = await buildDrone(); scene.add(drone);
  controls.target.copy(fit(camera, drone, .95, [.0, .62, .78]));
  autoSize(el, renderer, camera);
  const vis = onScreen(el);
  renderer.setAnimationLoop(() => { if (!vis.v) return; props.forEach(p => { p.hub.rotation.z += p.dir * .04; }); controls.update(); renderer.render(scene, camera); });
  el.classList.add('ready');
}
function makeStick(el) {
  const knob = el.querySelector('.knob'), s = { x: 0, y: 0, active: false };
  const move = e => {
    const r = el.getBoundingClientRect(), R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const m = Math.hypot(dx, dy), lim = R * .62; if (m > lim) { dx *= lim / m; dy *= lim / m; }
    s.x = dx / lim; s.y = -dy / lim; knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  };
  el.addEventListener('pointerdown', e => { e.preventDefault(); s.active = true; el.setPointerCapture(e.pointerId); move(e); });
  el.addEventListener('pointermove', e => { if (s.active) move(e); });
  const up = () => { s.active = false; s.x = s.y = 0; knob.style.transform = 'translate(-50%,-50%)'; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  return s;
}
async function initDroneSim(modal) {
  const el = document.getElementById('dsim');
  const renderer = makeRenderer(el, false);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0d10'); scene.fog = new THREE.Fog('#0b0d10', 8, 34);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(4, 8, 3); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8fd6fa, 0x0b0d10, .6));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), std('#0f1318', { roughness: 1 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const grid = new THREE.GridHelper(60, 120, 0x1f4a66, 0x18222c); grid.position.y = .001; scene.add(grid);
  const padTex = labelTex([['H', 150, 136]], 256, 256, '#1d1d1f');
  const pad = new THREE.Mesh(new THREE.CircleGeometry(.22, 48), std('#fff', { map: padTex })); pad.rotation.x = -Math.PI / 2; pad.position.y = .002; scene.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.21, .225, 48), new THREE.MeshBasicMaterial({ color: '#2ea6ff' })); ring.rotation.x = -Math.PI / 2; ring.position.y = .003; scene.add(ring);
  const gates = [[0, 1.4, -5], [3.5, 2.2, -10], [-1.5, 1.6, -15]].map(([x, y, z], i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(.7, .05, 16, 64), std('#2ea6ff', { emissive: '#2ea6ff', emissiveIntensity: .8 }));
    m.position.set(x, y, z); m.rotation.y = i === 1 ? -.4 : 0; scene.add(m);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, y - .7), std('#2c2c2e')); pole.position.set(x, (y - .7) / 2, z); scene.add(pole);
    return { m, passed: false, prev: null };
  });
  const { drone, props, ledF } = await buildDrone(); scene.add(drone);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.07, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .5, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
  const camera = new THREE.PerspectiveCamera(55, 1, .01, 100); camera.position.set(0, .2, .48);
  autoSize(el, renderer, camera);

  const L = makeStick(document.getElementById('stickL')), R = makeStick(document.getElementById('stickR'));
  const keys = new Set();
  const keyMap = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  const isOpen = () => modal.classList.contains('open');
  addEventListener('keydown', e => { if (!isOpen() || !keyMap.includes(e.code)) return; e.preventDefault(); if (e.code === 'Space' && !e.repeat) toggleArm(); keys.add(e.code); });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('hx-modal', () => keys.clear());
  const st = { p: new THREE.Vector3(), v: new THREE.Vector3(), vz: 0, yaw: 0, roll: 0, pitch: 0, armed: false, rpm: 0, tR: 0, tP: 0 };
  const motorSnd = window.HXA.motor('drone');
  const armBtn = document.getElementById('armBtn'), armState = document.getElementById('armState');
  function toggleArm() {
    st.armed = !st.armed; st.armed ? window.HXA.sfx.armOn() : window.HXA.sfx.armOff();
    armBtn.classList.toggle('on', st.armed); armBtn.textContent = st.armed ? 'Khóa động cơ' : 'Mở khóa động cơ';
    armState.classList.toggle('on', st.armed); armState.textContent = st.armed ? 'Đẩy cần trái lên để cất cánh' : 'Động cơ đang khóa';
  }
  armBtn.addEventListener('click', toggleArm);
  const hud = document.getElementById('hud'), packet = document.getElementById('packet'), gatesEl = document.getElementById('gates');
  const ax = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const deg = r => (r * 180 / Math.PI).toFixed(1).padStart(6);
  let last = performance.now(), lastPkt = 0, passed = 0;
  renderer.setAnimationLoop(now => {
    const frameDt = Math.min(.25, (now - last) / 1000); last = now;
    if (!isOpen()) return;
    // JoyData như tay cầm thật: XL, YL (cần trái), XR, YR (cần phải)
    const XL = clamp(L.x + ax('KeyD', 'KeyA'), -1, 1), YL = clamp(L.y + ax('KeyW', 'KeyS'), -1, 1);
    const XR = clamp(R.x + ax('ArrowRight', 'ArrowLeft'), -1, 1), YR = clamp(R.y + ax('ArrowUp', 'ArrowDown'), -1, 1);
    let f = new THREE.Vector3(-Math.sin(st.yaw), 0, -Math.cos(st.yaw)), r;
    // chia nhỏ bước tính để mô phỏng đúng tốc độ cả khi máy chạy ít khung hình
    for (let left = frameDt; left > 1e-6; left -= 1 / 120) {
      const dt = Math.min(left, 1 / 120), air = st.p.y > .005;
      if (st.armed) {
        st.tR = XR * .44; st.tP = YR * .44;
        const kk = Math.min(1, dt * 7);
        if (air) { st.roll += (st.tR - st.roll) * kk; st.pitch += (st.tP - st.pitch) * kk; st.yaw -= XL * 2.1 * dt; }
        st.vz += (YL * 1.6 - st.vz) * Math.min(1, dt * 5);
        st.rpm += ((air || YL > 0 ? .6 + YL * .3 + (Math.abs(st.roll) + Math.abs(st.pitch)) * .4 : .25) - st.rpm) * Math.min(1, dt * 6);
      } else {
        st.tR = st.tP = 0; st.roll *= 1 - Math.min(1, dt * 3); st.pitch *= 1 - Math.min(1, dt * 3);
        if (air) st.vz -= 9.8 * dt; st.rpm *= 1 - Math.min(1, dt * 2);
      }
      f = new THREE.Vector3(-Math.sin(st.yaw), 0, -Math.cos(st.yaw)); r = new THREE.Vector3(Math.cos(st.yaw), 0, -Math.sin(st.yaw));
      if (air) { st.v.addScaledVector(r, 9.8 * Math.tan(st.roll) * dt).addScaledVector(f, 9.8 * Math.tan(st.pitch) * dt); st.v.multiplyScalar(Math.exp(-1.1 * dt)); }
      st.p.addScaledVector(st.v, dt); st.p.y += st.vz * dt;
      if (st.p.y <= 0) { st.p.y = 0; if (st.vz < 0) st.vz = 0; st.v.multiplyScalar(.6); }
      st.p.y = Math.min(st.p.y, 18);
      const rad = Math.hypot(st.p.x, st.p.z); if (rad > 25) { st.p.x *= 25 / rad; st.p.z *= 25 / rad; st.v.multiplyScalar(.5); }
      drone.position.set(st.p.x, st.p.y, st.p.z);
      gates.forEach(gt => {
        const local = gt.m.worldToLocal(drone.position.clone());
        if (gt.prev !== null && Math.sign(local.z) !== Math.sign(gt.prev) && Math.hypot(local.x, local.y) < .7 && !gt.passed) {
          gt.passed = true; passed++; gt.m.material.color.set('#30d158'); gt.m.material.emissive.set('#30d158');
          gatesEl.textContent = passed === 3 ? 'Hoàn thành 3/3' : `Vòng ${passed}/3`; window.HXA.sfx.chime();
        }
        gt.prev = local.z;
      });
    }
    const dt = frameDt;
    drone.rotation.set(-st.pitch, st.yaw, -st.roll, 'YXZ');
    props.forEach(pr => { pr.hub.rotation.z += pr.dir * st.rpm * 60 * dt; pr.disc.material.opacity = Math.max(0, st.rpm - .3) * .5; pr.blade.visible = st.rpm < .55; });
    motorSnd.set(st.rpm);
    ledF.material.color.set(st.armed ? '#2ea6ff' : '#3a3a3c');
    if (st.armed) { const msg = st.p.y > .05 ? 'Đang bay · Bay qua 3 vòng xanh' : 'Đẩy cần trái lên để cất cánh'; if (armState.textContent !== msg) armState.textContent = msg; }
    shadow.position.set(st.p.x, .003, st.p.z); shadow.material.opacity = .5 / (1 + st.p.y * 1.5);
    const camT = st.p.clone().addScaledVector(f, -.48).add(new THREE.Vector3(0, .2 + st.p.y * .02, 0));
    camera.position.lerp(camT, 1 - Math.exp(-4 * dt));
    camera.lookAt(st.p.clone().addScaledVector(f, .35).add(new THREE.Vector3(0, .03, 0)));
    renderer.render(scene, camera);
    if (now - lastPkt > 50) { // tay cầm gửi gói ESP-NOW khoảng 50 ms một lần
      lastPkt = now; const q = v => Math.round(v * 10);
      packet.textContent = `ESP-NOW → JoyData {XL:${q(XL)}, YL:${q(YL)}, SWL:0, XR:${q(XR)}, YR:${q(YR)}, SWR:0, webCommand:0}`;
      hud.innerHTML = `<div class="row"><span class="k">ROLL </span><span>${deg(st.tR)} / <b>${deg(st.roll)}</b></span></div>`
        + `<div class="row"><span class="k">PITCH</span><span>${deg(st.tP)} / <b>${deg(st.pitch)}</b></span></div>`
        + `<div class="row"><span class="k">YAW  </span><b>${deg(((st.yaw % 6.283) + 6.283) % 6.283)}</b></div>`
        + `<div class="row"><span class="k">ALT  </span><b>${st.p.y.toFixed(2)} m</b></div>`
        + `<div class="link">Telemetry · đích / hiện tại</div>`;
    }
  });
  el.classList.add('ready');
}

/* ---------- Xe dò line lắp từ vỏ servo, vỏ bánh xe, lego và HiNex Link (đơn vị mm) ---------- */
function makeServo() {
  // Servo MG90S nằm nghiêng trong vỏ: thân 22,5 × 12,2 × 22,8 mm, trục ra phía +X
  const g = new THREE.Group();
  const dark = std('#26272b');
  const label = std('#fff', { map: labelTex([['MG90S', 92, 110], ['SERVO', 40, 178, '#8e8e93']], 512, 256, '#26272b') });
  const body = new THREE.Mesh(new THREE.BoxGeometry(22.5, 12.2, 22.8), [dark, dark, label, dark, dark, dark]); body.position.set(-11.75, 8.1, 0); g.add(body);
  const tabs = new THREE.Mesh(new THREE.BoxGeometry(2.5, 12.2, 32.2), dark); tabs.position.set(-5.85, 8.1, 0); g.add(tabs);
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 3, 32), dark); boss.rotation.z = Math.PI / 2; boss.position.set(1, 8.1, 5.9); g.add(boss);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3, 20), std('#e8e8ed', { metalness: .4 })); shaft.rotation.z = Math.PI / 2; shaft.position.set(4, 8.1, 5.9); g.add(shaft);
  ['#6b3e1f', '#e0332b', '#f2a33a'].forEach((c, i) => { const w = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 16), std(c)); w.position.set(-18, 6.9 + i * 1.2, -19); g.add(w); });
  return g;
}
function studsGrid(nx, nz, y, color) {
  const geo = new THREE.CylinderGeometry(2.4, 2.4, 1.7, 20);
  const m = new THREE.InstancedMesh(geo, plastic(color), nx * nz); const d = new THREE.Object3D(); let i = 0;
  for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) { d.position.set((a - (nx - 1) / 2) * 8, y + .85, (b - (nz - 1) / 2) * 8); d.updateMatrix(); m.setMatrixAt(i++, d.matrix); }
  return m;
}
function brick(nx, nz, h, color, faceTex) {
  const g = new THREE.Group();
  const mat = plastic(color);
  const mats = faceTex ? [std('#fff', { map: faceTex }), std('#fff', { map: faceTex }), mat, mat, mat, mat] : mat;
  const b = new THREE.Mesh(new THREE.BoxGeometry(nx * 8 - .2, h, nz * 8 - .2), mats); b.position.y = h / 2; g.add(b);
  g.add(studsGrid(nx, nz, h, color));
  return g;
}
async function buildCar() {
  const [gC, gL, gW] = await Promise.all(['lego-servo', 'lego-servo-top', 'lego-wheel'].map(n => loadGeo(`${BASE}models/${n}.stl`)));
  const car = new THREE.Group();                      // gốc xe: mặt đất y = 0, đầu xe hướng -Z
  const body = new THREE.Group(); body.position.y = 4.4; car.add(body);
  const parts = [], wheels = [], irDots = [];
  const part = (obj, key, off) => { obj.userData = { home: obj.position.clone(), off, key }; parts.push(obj); return obj; };
  [1, -1].forEach(side => {
    const mod = new THREE.Group(); mod.position.set(30 * side, 0, 20); mod.scale.x = side; body.add(mod);
    mod.add(new THREE.Mesh(gC, plastic('#ff9f0a')));
    mod.add(part(makeServo(), 'servo', new THREE.Vector3(0, 46, 0)));
    const lid = new THREE.Mesh(gL, plastic('#ffb340')); lid.rotation.x = Math.PI; lid.position.y = 17.2; mod.add(part(lid, 'lid', new THREE.Vector3(0, 70, 0)));
    const wheel = new THREE.Group(); wheel.position.set(2.5, 8.1, 5.9);
    const spin = new THREE.Group(); wheel.add(spin);
    const wm = new THREE.Mesh(gW, plastic('#0a72d6')); wm.rotation.z = -Math.PI / 2; spin.add(wm);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(11.7, 1.4, 12, 48), std('#1d1d1f', { roughness: .9 })); tire.rotation.y = Math.PI / 2; tire.position.x = 6.6; spin.add(tire);
    mod.add(part(wheel, 'wheel', new THREE.Vector3(38, 0, 0)));
    wheels.push({ spin, side });
  });
  const PZ = -14.1;
  const plate = new THREE.Group(); plate.position.set(0, 15.2, PZ);
  const pb = new THREE.Mesh(new THREE.BoxGeometry(63.6, 3.2, 111.6), plastic('#d6d9de')); pb.position.y = 1.6; plate.add(pb); plate.add(studsGrid(8, 14, 3.2, '#d6d9de'));
  body.add(part(plate, 'plate', new THREE.Vector3(0, 90, 0)));
  const brainTex = labelTex([['HiNex Link V1', 64, 100], ['ESP32-S3', 48, 170, '#8fd6fa']], 512, 256, '#2c2c2e');
  const brain = brick(6, 8, 19.2, '#2c2c2e', brainTex); brain.position.set(0, 18.4, PZ - 4);
  const linkBand = new THREE.Mesh(new THREE.BoxGeometry(48.4, 1.4, 64.4), std('#1A9FE0', { emissive: '#1A9FE0', emissiveIntensity: .4 })); linkBand.position.y = .7; brain.add(linkBand);
  body.add(part(brain, 'brain', new THREE.Vector3(0, 130, 0)));
  const sensor = new THREE.Group(); sensor.position.set(0, 5.6, -62);
  const sb = new THREE.Mesh(new THREE.BoxGeometry(31.6, 9.6, 15.6), plastic('#8fd6fa')); sb.position.y = 4.8; sensor.add(sb);
  const sBand = new THREE.Mesh(new THREE.BoxGeometry(32, 1.2, 16), std('#1A9FE0', { emissive: '#1A9FE0', emissiveIntensity: .4 })); sBand.position.y = 9.6; sensor.add(sBand);
  [-10, 10].forEach(x => {
    const head = new THREE.Mesh(new THREE.BoxGeometry(6, 3.6, 6), std('#1d1d1f')); head.position.set(x, -1.8, 0); sensor.add(head);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), new THREE.MeshBasicMaterial({ color: '#5a1a16' })); dot.position.set(x, -3.6, 0); sensor.add(dot); irDots.push(dot);
  });
  body.add(part(sensor, 'sensor', new THREE.Vector3(0, 0, -80)));
  const caster = new THREE.Group(); caster.position.set(0, 0, -44);
  const holder = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 12, 20), plastic('#d6d9de')); holder.position.y = 9.2; caster.add(holder);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), std('#c7c7cc', { metalness: .7, roughness: .25 })); ball.position.y = .6; caster.add(ball);
  body.add(part(caster, 'caster', new THREE.Vector3(0, -50, 0)));
  return { car, parts, wheels, irDots };
}
function setExploded(parts, map) { parts.forEach(p => { const e = map[p.userData.key] ?? 0; p.position.copy(p.userData.home).addScaledVector(p.userData.off, e); p.visible = e < .999 || ['servo', 'lid', 'wheel'].includes(p.userData.key); }); }
async function initCarShow(el) {
  const renderer = makeRenderer(el), scene = litScene(renderer);
  const camera = new THREE.PerspectiveCamera(28, 1, 1, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = true; controls.autoRotate = !reduced; controls.autoRotateSpeed = 1.1;
  const { car, parts } = await buildCar(); setExploded(parts, {}); car.rotation.y = .6; scene.add(car);
  controls.target.copy(fit(camera, car, 1.05, [.7, .45, .6]));
  autoSize(el, renderer, camera);
  const vis = onScreen(el);
  renderer.setAnimationLoop(() => { if (!vis.v) return; controls.update(); renderer.render(scene, camera); });
  el.classList.add('ready');
}

// đường line đen trên sa bàn 1400 × 900 mm
const TRACK = { w: 1400, h: 900, px: 2048 };
function buildTrack() {
  const pts = [[-480, -250], [-120, -330], [260, -300], [540, -200], [580, 60], [420, 280], [140, 220], [-60, 320], [-380, 300], [-560, 120], [-580, -100]].map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const W = TRACK.px, H = Math.round(TRACK.px * TRACK.h / TRACK.w), s = W / TRACK.w;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#fbfbfd'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#e8e8ed'; g.lineWidth = 1; for (let x = 0; x < W; x += 100 * s) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 100 * s) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const toPx = v => [(v.x + TRACK.w / 2) * s, (v.z + TRACK.h / 2) * s];
  g.strokeStyle = '#111'; g.lineWidth = 19 * s; g.lineJoin = g.lineCap = 'round'; g.beginPath();
  curve.getSpacedPoints(600).forEach((v, i) => { const [x, y] = toPx(v); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke();
  const start = curve.getPointAt(0), [sx, sy] = toPx(start); g.fillStyle = '#30d158'; g.fillRect(sx - 4, sy - 24 * s, 8, 48 * s);
  const data = g.getImageData(0, 0, W, H).data;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(TRACK.w, TRACK.h), std('#fff', { map: tex, roughness: .9 })); mesh.rotation.x = -Math.PI / 2; mesh.position.y = .05;
  const isBlack = (x, z) => { const px = Math.round((x + TRACK.w / 2) * s), py = Math.round((z + TRACK.h / 2) * s); if (px < 0 || py < 0 || px >= W || py >= H) return false; const i = (py * W + px) * 4; return data[i] < 110 && data[i + 1] < 110; };
  return { mesh, curve, isBlack };
}
const STEP_CAP = [
  '',
  'Đặt servo MG90S vào vỏ in 3D, rồi đậy nắp.',
  'Cắm vỏ bánh xe vào trục servo. Lốp cao su ôm vào rãnh bánh.',
  'Gắn hai cụm bánh lên tấm lego. Bộ não, cảm biến và camera hít vào bằng HiNex Link.',
  ''
];
const MODE_CAP = {
  line: 'Dò line: hai mắt hồng ngoại nhìn vạch đen, bộ não quyết định rẽ trái, rẽ phải hay đi thẳng.',
  avoid: 'Né vật cản: LiDAR quét 360°, thấy vật phía trước gần hơn 16 cm thì quay sang phía trống hơn.',
  cam: 'Camera AI: nhận diện vật thể trong khung hình, thấy quả bóng thì lái tới, chưa thấy thì xoay tìm.'
};
const MODE_CODE = {
  line: ['lặp mãi:', '  nếu trái thấy line → rẽ trái', '  nếu phải thấy line → rẽ phải', '  còn lại → đi thẳng'],
  avoid: ['lặp mãi:', '  d = LiDAR.khoảng_cách(phía trước)', '  nếu d < 16 cm → quay sang phía trống', '  còn lại → đi thẳng'],
  cam: ['lặp mãi:', '  vật = AI.nhận_diện(camera)', '  nếu thấy "quả bóng" → lái tới', '  còn lại → xoay tìm']
};
const SEQ = { 1: [['servo', 0], ['lid', 1.1]], 2: [['wheel', 0]], 3: [['plate', 0], ['brain', .9], ['sensor', 1.7], ['caster', 2.3]] };
const STEP_OF = { servo: 1, lid: 1, wheel: 2, plate: 3, brain: 3, sensor: 3, caster: 3 };
async function initCarSim(modal) {
  const el = document.getElementById('csim');
  const renderer = makeRenderer(el, false);
  const scene = litScene(renderer); scene.background = new THREE.Color('#f5f5f7');
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2500, 64), std('#eceef1', { roughness: 1 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 60; controls.maxDistance = 3500; controls.maxPolarAngle = 1.45;
  autoSize(el, renderer, camera);
  const { car, parts, wheels, irDots } = await buildCar(); scene.add(car);
  const body = car.children[0];
  const track = buildTrack(); track.mesh.visible = false; scene.add(track.mesh);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#1A9FE0', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(30, 34, 48), ringMat); ring.rotation.x = -Math.PI / 2; car.add(ring);

  // cảm biến gắn thêm cho từng chế độ: LiDAR trên nóc bộ não, camera ở đầu xe
  const lidar = new THREE.Group(); lidar.position.set(0, 40.5, -18); body.add(lidar);
  const lidBase = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 6, 32), std('#1d1d1f')); lidBase.position.y = 3; lidar.add(lidBase);
  const lidHead = new THREE.Group(); lidHead.position.y = 9; lidar.add(lidHead);
  lidHead.add(new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 6, 32), std('#3a3a3c')));
  const lidWin = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 2), new THREE.MeshBasicMaterial({ color: '#ff453a' })); lidWin.position.set(0, 0, -9); lidHead.add(lidWin);
  const camMod = new THREE.Group(); camMod.position.set(0, 38, -44); body.add(camMod);
  camMod.add(new THREE.Mesh(new THREE.BoxGeometry(24, 18, 6), std('#1d1d1f')));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 5, 24), std('#0b0d10', { metalness: .6, roughness: .2 })); lens.rotation.x = Math.PI / 2; lens.position.z = -4.5; camMod.add(lens);
  const camLed = new THREE.Mesh(new THREE.SphereGeometry(1.2), new THREE.MeshBasicMaterial({ color: '#30d158' })); camLed.position.set(8, 5, -3.2); camMod.add(camLed);

  // sa bàn né vật cản và tìm vật: tường bao + khối cản
  const ARENA = { w: 1400, h: 900 };
  const arena = new THREE.Group(); arena.visible = false; scene.add(arena);
  const ground2 = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.w, ARENA.h), std('#fbfbfd', { roughness: .95 })); ground2.rotation.x = -Math.PI / 2; ground2.position.y = .05; arena.add(ground2);
  const gridA = new THREE.GridHelper(1400, 14, 0xd2d2d7, 0xe8e8ed); gridA.scale.z = 900 / 1400; gridA.position.y = .1; arena.add(gridA);
  const wallMat = plastic('#d6d9de');
  [[0, -ARENA.h / 2, ARENA.w, 20], [0, ARENA.h / 2, ARENA.w, 20], [-ARENA.w / 2, 0, 20, ARENA.h], [ARENA.w / 2, 0, 20, ARENA.h]].forEach(([x, z, w, d]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 60, d), wallMat); m.position.set(x, 30, z); arena.add(m); });
  const BOXES = [[-360, -150, 140, 120], [-80, 220, 160, 110], [250, -220, 120, 160], [420, 160, 150, 130], [-520, 250, 110, 110], [60, -60, 90, 90]].map(([x, z, w, d], i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 70 + (i % 3) * 25, d), plastic(['#ff9f0a', '#1A9FE0', '#34c759', '#5e5ce6', '#ff6961', '#ffd60a'][i]));
    m.position.set(x, m.geometry.parameters.height / 2, z); arena.add(m);
    return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, m };
  });
  // vật thể cho camera AI
  const ball = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 20), plastic('#ff3b30', .35)); ball.position.y = 30; arena.add(ball);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(28, 80, 24), plastic('#ff9f0a')); cone.position.set(480, 40, -280); arena.add(cone);
  const duck = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 16), plastic('#ffd60a')); duck.position.set(-450, 26, -300); arena.add(duck);
  const OBJ = [{ m: ball, name: 'Quả bóng', target: true }, { m: cone, name: 'Cọc giao thông' }, { m: duck, name: 'Vịt đồ chơi' }];
  BOXES.forEach(b => OBJ.push({ m: b.m, name: 'Khối lego' }));
  const BALL_SPOTS = [[300, 300], [-250, -320], [520, -40], [-560, 40], [140, 120], [-200, 360]];
  let ballSpot = 0;
  const lidarPts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(72 * 3), 3)), new THREE.PointsMaterial({ color: '#ff3b30', size: 9 }));
  lidarPts.visible = false; scene.add(lidarPts);
  const rayLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ff3b30' }));
  rayLine.visible = false; scene.add(rayLine);

  const capEl = document.getElementById('stepCap'), chud = document.getElementById('chud'), boxesEl = document.getElementById('cBoxes');
  const stepBtns = [...document.querySelectorAll('#steps button')];
  let step = 1, stepT = 0, camTween = null, pulseT = -1, pulsed = {}, mode = 'line';
  const camFor = s => s <= 2 ? { t: new THREE.Vector3(24, 14, 22), p: new THREE.Vector3(150, 95, 120) }
    : s === 3 ? { t: new THREE.Vector3(0, 22, -12), p: new THREE.Vector3(250, 190, 230) }
    : { t: new THREE.Vector3(0, 0, 0), p: new THREE.Vector3(0, 1150, 900) };
  const codeEl = document.getElementById('code'), senseEl = document.getElementById('cSense');
  function setMode(m) {
    mode = m;
    document.querySelectorAll('#cModes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m));
    codeEl.innerHTML = MODE_CODE[m].map((l, i) => `<span data-r="${i}"${i ? '' : ' class="kw"'}>${l}</span>`).join('');
    senseEl.innerHTML = m === 'line' ? '<span><i class="sdot" id="sL"></i>Trái</span><span><i class="sdot" id="sR"></i>Phải</span>'
      : m === 'avoid' ? '<span>Phía trước <b id="sD">--</b></span><span>Trái <b id="sDl">--</b></span><span>Phải <b id="sDr">--</b></span>'
      : '<span>Thấy: <b id="sObj">--</b></span><span>Đã tìm <b id="sFound">0</b></span>';
    if (step === 4) { capEl.textContent = MODE_CAP[m]; applyScene(); resetRun(); }
  }
  document.querySelectorAll('#cModes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
  function applyScene() {
    const on4 = step === 4;
    track.mesh.visible = on4 && mode === 'line'; arena.visible = on4 && mode !== 'line'; floor.visible = !on4;
    lidar.visible = mode === 'avoid' || !on4; camMod.visible = mode === 'cam' || !on4;
    lidarPts.visible = on4 && mode === 'avoid'; rayLine.visible = on4 && mode === 'avoid';
    ball.visible = cone.visible = duck.visible = mode === 'cam';
    boxesEl.innerHTML = '';
  }
  function goStep(s) {
    step = s; stepT = 0; pulsed = {};
    stepBtns.forEach(b => { const n = +b.dataset.s; b.setAttribute('aria-pressed', n === s); b.classList.toggle('done', n < s); });
    capEl.textContent = s === 4 ? MODE_CAP[mode] : STEP_CAP[s];
    document.getElementById('stepNext').textContent = s < 4 ? 'Bước tiếp ›' : 'Lắp lại từ đầu';
    chud.classList.toggle('show', s === 4);
    applyScene();
    if (s === 4) resetRun(); else { car.position.set(0, 0, 0); car.rotation.set(0, 0, 0); }
    const c = camFor(s); camTween = { t0: camera.position.clone(), c0: controls.target.clone(), t1: c.p, c1: c.t, k: 0 };
  }
  stepBtns.forEach(b => b.addEventListener('click', () => goStep(+b.dataset.s)));
  document.getElementById('stepNext').addEventListener('click', () => goStep(step < 4 ? step + 1 : 1));
  document.getElementById('stepReplay').addEventListener('click', () => goStep(step));

  const run = { x: 0, z: 0, th: 0, vl: 0, vr: 0, rule: 3, turn: 0, found: 0, see: '' };
  const mL = document.getElementById('mL'), mR = document.getElementById('mR'), mLv = document.getElementById('mLv'), mRv = document.getElementById('mRv');
  const speedEl = document.getElementById('cSpeed'), followEl = document.getElementById('cFollow');
  function placeBall() { const [x, z] = BALL_SPOTS[ballSpot++ % BALL_SPOTS.length]; ball.position.set(x, 30, z); }
  function resetRun() {
    run.vl = run.vr = 0; run.turn = 0;
    if (mode === 'line') { const p = track.curve.getPointAt(0), t = track.curve.getTangentAt(0); run.x = p.x; run.z = p.z; run.th = Math.atan2(-t.x, -t.z); }
    else { run.x = -600; run.z = -20; run.th = -Math.PI / 2; if (mode === 'cam') placeBall(); }
  }
  document.getElementById('cReset').addEventListener('click', resetRun);
  const local = (lx, lz) => [run.x + lx * Math.cos(run.th) + lz * Math.sin(run.th), run.z - lx * Math.sin(run.th) + lz * Math.cos(run.th)];
  // tia đo khoảng cách (mm) theo hướng a so với đầu xe, từ tâm LiDAR
  const blocked = (x, z) => Math.abs(x) > ARENA.w / 2 - 10 || Math.abs(z) > ARENA.h / 2 - 10 || BOXES.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
  function ray(a, max = 800) {
    const ang = run.th + a, dx = -Math.sin(ang), dz = -Math.cos(ang);
    const [ox, oz] = local(0, -18);
    for (let d = 0; d < max; d += 6) if (blocked(ox + dx * d, oz + dz * d)) return d;
    return max;
  }
  const isOpen = () => modal.classList.contains('open');
  const servoSnd = window.HXA.motor('servo');
  setMode('line');
  goStep(1);
  let last = performance.now(), hudT = 0, lidT = 0;
  const v3 = new THREE.Vector3();
  renderer.setAnimationLoop(now => {
    const dt = Math.min(.25, (now - last) / 1000); last = now;
    if (!isOpen()) return;
    stepT += dt;
    const ex = {};
    Object.keys(STEP_OF).forEach(k => {
      const ps = STEP_OF[k];
      if (ps < step) ex[k] = 0; else if (ps > step) ex[k] = 1;
      else { const at = SEQ[ps].find(a => a[0] === k)[1]; const q = Math.min(1, Math.max(0, (stepT - at) / 1)); const e = 1 - q * q * (3 - 2 * q); ex[k] = e; if (q >= 1 && !pulsed[k]) { pulsed[k] = true; window.HXA.sfx.snap(); if (k === 'brain' || k === 'sensor') pulseT = 0; } }
    });
    if (step === 4) Object.keys(ex).forEach(k => ex[k] = 0);
    setExploded(parts, ex);
    if (step === 2) wheels.forEach(w => { w.spin.rotation.x = -stepT * 3 * (1 - Math.min(1, stepT / 1.2)); });
    if (pulseT >= 0) { pulseT += dt; ring.scale.setScalar(1 + pulseT * 2.5); ring.position.set(0, 24, -14); ringMat.opacity = Math.max(0, .8 - pulseT * 1.4); if (pulseT > .7) pulseT = -1; }

    if (step === 4) {
      const base = +speedEl.value;
      servoSnd.set(.25 + base / 220 * .75);
      let dFront = 0, dL = 0, dR = 0, seen = [];
      for (let left = dt; left > 1e-6; left -= 1 / 120) {
        const h = Math.min(left, 1 / 120);
        if (mode === 'line') {
          const [lx, lz] = local(-10, -62), [rx, rz] = local(10, -62);
          const L = track.isBlack(lx, lz), R = track.isBlack(rx, rz);
          if (L && !R) { run.vl = base * .1; run.vr = base; run.rule = 1; }
          else if (R && !L) { run.vl = base; run.vr = base * .1; run.rule = 2; }
          else { run.vl = run.vr = base; run.rule = 3; }
          run.L = L; run.R = R;
        } else if (mode === 'avoid') {
          dFront = Math.min(ray(0), ray(.25), ray(-.25)) - 70;
          if (run.turn) {
            run.vl = -run.turn * base * .55; run.vr = run.turn * base * .55; run.rule = 2;
            if (dFront > 260) run.turn = 0;
          } else if (dFront < 160) {
            dL = ray(.9); dR = ray(-.9); run.turn = dL >= dR ? 1 : -1; run.rule = 2;
          } else { run.vl = run.vr = base; run.rule = 3; }
        } else {
          // camera: góc nhìn ±35°, tầm nhìn 900 mm
          const fx = -Math.sin(run.th), fz = -Math.cos(run.th);
          const bx = ball.position.x - run.x, bz = ball.position.z - run.z, bd = Math.hypot(bx, bz);
          const ang = Math.atan2(fx * bz - fz * bx, fx * bx + fz * bz);
          const ahead = Math.min(ray(0), ray(.3), ray(-.3)) - 70;
          if (bd < 105) { run.found++; window.HXA.sfx.chime(); placeBall(); }
          else if (Math.abs(ang) < .61 && bd < 900 && ahead > bd - 120) { const k = Math.max(-1, Math.min(1, -ang * 2.2)); run.vl = base * (1 - Math.max(0, -k) * .8); run.vr = base * (1 - Math.max(0, k) * .8); run.rule = 2; }
          else if (ahead < 150) { run.vl = -base * .5; run.vr = base * .5; run.rule = 3; }
          else { run.vl = base * .55; run.vr = base * .85; run.rule = 3; } // vừa đi vừa quét
        }
        const v = (run.vl + run.vr) / 2, w = (run.vr - run.vl) / 74;
        run.th += w * h; run.x += -Math.sin(run.th) * v * h; run.z += -Math.cos(run.th) * v * h;
        wheels.forEach(wh => { wh.spin.rotation.x -= ((wh.side > 0 ? run.vr : run.vl) / 12.5) * h; });
      }
      const lim = mode === 'line' ? TRACK : ARENA;
      if (Math.abs(run.x) > lim.w / 2 || Math.abs(run.z) > lim.h / 2) resetRun();
      car.position.set(run.x, 0, run.z); car.rotation.set(0, run.th, 0);
      irDots[0].material.color.set(mode === 'line' && run.L ? '#ff3b30' : '#5a1a16'); irDots[1].material.color.set(mode === 'line' && run.R ? '#ff3b30' : '#5a1a16');
      if (mode === 'avoid') {
        lidHead.rotation.y += dt * 12; lidT += dt;
        if (lidT > .1) {
          lidT = 0; const arr = lidarPts.geometry.attributes.position.array, [ox, oz] = local(0, -18);
          for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, d = ray(a, 700), g = run.th + a; arr[i * 3] = ox - Math.sin(g) * d; arr[i * 3 + 1] = 45; arr[i * 3 + 2] = oz - Math.cos(g) * d; }
          lidarPts.geometry.attributes.position.needsUpdate = true;
          const df = ray(0, 700); rayLine.geometry.setFromPoints([new THREE.Vector3(ox, 45, oz), new THREE.Vector3(ox - Math.sin(run.th) * df, 45, oz - Math.cos(run.th) * df)]);
        }
      }
      if (followEl.checked && !camTween) {
        const fx = -Math.sin(run.th), fz = -Math.cos(run.th), back = mode === 'line' ? 260 : 420;
        const want = new THREE.Vector3(run.x - fx * back, mode === 'line' ? 210 : 380, run.z - fz * back);
        camera.position.lerp(want, 1 - Math.exp(-2.5 * dt)); controls.target.lerp(new THREE.Vector3(run.x + fx * 120, 10, run.z + fz * 120), 1 - Math.exp(-4 * dt));
      }
      hudT += dt;
      if (hudT > .08) {
        hudT = 0;
        const pl = Math.round(run.vl / 2.2), pr = Math.round(run.vr / 2.2);
        mL.style.width = Math.abs(pl) + '%'; mR.style.width = Math.abs(pr) + '%'; mLv.textContent = pl + '%'; mRv.textContent = pr + '%';
        codeEl.querySelectorAll('[data-r]').forEach(c => c.classList.toggle('hit', +c.dataset.r === run.rule));
        if (mode === 'line') { document.getElementById('sL')?.classList.toggle('on', !!run.L); document.getElementById('sR')?.classList.toggle('on', !!run.R); }
        if (mode === 'avoid') { const f = Math.max(0, ray(0, 900) - 70); document.getElementById('sD').textContent = (f / 10).toFixed(0) + ' cm'; document.getElementById('sDl').textContent = (Math.max(0, ray(1.57, 900) - 42) / 10).toFixed(0) + ' cm'; document.getElementById('sDr').textContent = (Math.max(0, ray(-1.57, 900) - 42) / 10).toFixed(0) + ' cm'; }
        if (mode === 'cam') {
          // khung nhận diện: vật nằm trong góc nhìn ±35° và tầm 900 mm của camera trên xe
          const fx = -Math.sin(run.th), fz = -Math.cos(run.th), W = el.clientWidth, H = el.clientHeight;
          let html = '', names = [];
          OBJ.forEach(o => {
            if (!o.m.visible) return;
            const ox = o.m.position.x - run.x, oz = o.m.position.z - run.z, d = Math.hypot(ox, oz);
            const a = Math.atan2(fx * oz - fz * ox, fx * ox + fz * oz);
            if (Math.abs(a) > .61 || d > 900 || d < 40) return;
            const bb = new THREE.Box3().setFromObject(o.m); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            for (let i = 0; i < 8; i++) { v3.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).project(camera); const sx = (v3.x + 1) / 2 * W, sy = (1 - v3.y) / 2 * H; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
            if (v3.z > 1) return;
            const conf = Math.round(Math.max(.55, .97 - d / 3000) * 100);
            names.push(o.name);
            html += `<div class="bx${o.target ? ' tg' : ''}" style="left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px"><i>${o.name} ${conf}%</i></div>`;
          });
          boxesEl.innerHTML = html;
          document.getElementById('sObj').textContent = names.length ? [...new Set(names)].join(', ') : 'chưa thấy vật';
          document.getElementById('sFound').textContent = run.found + ' bóng';
        }
      }
    } else boxesEl.innerHTML = '';
    if (camTween) {
      camTween.k = Math.min(1, camTween.k + dt / 1.3); const e = 1 - Math.pow(1 - camTween.k, 3);
      camera.position.lerpVectors(camTween.t0, camTween.t1, e); controls.target.lerpVectors(camTween.c0, camTween.c1, e);
      if (camTween.k >= 1) camTween = null;
    }
    if (step !== 4) servoSnd.set(step === 2 && stepT < 1.2 ? .35 : 0);
    controls.update(); renderer.render(scene, camera);
  });
  el.classList.add('ready');
}

window.HX = { 'm-drone': initDroneSim, 'm-car': initCarSim };
dispatchEvent(new Event('hx-ready'));

const lazy = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return; lazy.unobserve(e.target);
  const run = { 'v-drone': initDroneShow, 'v-car': initCarShow }[e.target.id] || initViewer;
  run(e.target).catch(err => { console.error(err); const ph = e.target.querySelector('.ph'); if (ph) ph.textContent = 'Không tải được mô hình 3D.'; });
}), { rootMargin: '300px' });
document.querySelectorAll('.viewer').forEach(v => lazy.observe(v));

export { THREE, loadGeo, plastic, std, litScene, fit, buildDrone, buildCar, makeServo, setExploded };
