
  import * as THREE from 'https://unpkg.com/three@0.148.0/build/three.module.js';
  import { GLTFLoader } from 'https://unpkg.com/three@0.148.0/examples/jsm/loaders/GLTFLoader.js';
  import { GUI } from 'https://unpkg.com/dat.gui@0.7.9/build/dat.gui.module.js';
  import { parseShavitReplay } from './parseReplay.js';
/**
 * 1) SCENE + CAMERA
 */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// LIGHTS
const ambLight = new THREE.AmbientLight(0x404040);
scene.add(ambLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(100, 200, 100);
scene.add(dirLight);

/**
 * 2) GLOBALS
 */
let mapMesh = null;
let replayData = null;
let isPlaying = false;
let playbackTime = 0;

// We'll compute frameTime from the replay's tickrate, default fallback is 100
let frameTime = 1 / 100;

/**
 * Fallback plane/grid if no map loaded
 */
let fallbackPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshBasicMaterial({ color: 0x777777, wireframe: true })
);
fallbackPlane.rotation.x = -Math.PI / 2;
scene.add(fallbackPlane);

let fallbackGrid = new THREE.GridHelper(2000, 50);
scene.add(fallbackGrid);

/**
 * 3) HTML references
 *    Make sure these exist in your HTML file!
 */
const mapFileInput = document.getElementById('mapFile');
const replayFileInput = document.getElementById('replayFile');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const headerInfo = document.getElementById('headerInfo');

/**
 * 4) DAT.GUI for map transform
 *    If map is Z-up, rotateX:-90 to make Y-up in Three.js
 */
const mapSettings = {
  rotateX: -90,
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  scale: 1.0,
};

const gui = new GUI();
gui
  .add(mapSettings, 'rotateX', -180, 180, 1)
  .name('rotateX(deg)')
  .onChange(updateMapTransform);
gui
  .add(mapSettings, 'offsetX', -10000, 10000, 1)
  .name('offsetX')
  .onChange(updateMapTransform);
gui
  .add(mapSettings, 'offsetY', -10000, 10000, 1)
  .name('offsetY')
  .onChange(updateMapTransform);
gui
  .add(mapSettings, 'offsetZ', -10000, 10000, 1)
  .name('offsetZ')
  .onChange(updateMapTransform);
gui
  .add(mapSettings, 'scale', 0.001, 1000, 0.001)
  .name('scale')
  .onChange(updateMapTransform);

function updateMapTransform() {
  if (!mapMesh) return;
  const rx = THREE.MathUtils.degToRad(mapSettings.rotateX);
  mapMesh.rotation.set(rx, 0, 0);
  mapMesh.position.set(
    mapSettings.offsetX,
    mapSettings.offsetY,
    mapSettings.offsetZ
  );
  mapMesh.scale.set(mapSettings.scale, mapSettings.scale, mapSettings.scale);
}

/**
 * 5) LOAD MAP
 */
mapFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const loader = new GLTFLoader();
  loader.load(
    url,
    (gltf) => {
      // Remove fallback
      scene.remove(fallbackPlane);
      scene.remove(fallbackGrid);

      if (mapMesh) scene.remove(mapMesh);
      mapMesh = gltf.scene;

      // Center bounding box so map is around origin
      const box = new THREE.Box3().setFromObject(mapMesh);
      const center = new THREE.Vector3();
      box.getCenter(center);
      mapMesh.position.sub(center);

      updateMapTransform();
      scene.add(mapMesh);
      console.log('Map loaded, bounding center=', center);
    },
    undefined,
    (err) => console.error('Error loading map glb:', err)
  );
});

/**
 * 6) LOAD REPLAY
 */
replayFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    replayData = await parseShavitReplay(file);
    console.log(
      'Replay loaded:',
      replayData.mapName,
      replayData.frames.length,
      'frames',
      'tickrate=',
      replayData.tickrate
    );

    // set frameTime from replay's tickrate if version>=5
    // fallback if replayData.tickrate <1 => use 100
    if (replayData.tickrate && replayData.tickrate > 1) {
      frameTime = 1 / replayData.tickrate;
    } else {
      frameTime = 1 / 100;
    }

    headerInfo.innerHTML = `
      <strong>Map:</strong> ${replayData.mapName}<br/>
      <strong>Frames:</strong> ${replayData.frames.length}<br/>
      <strong>Tickrate:</strong> ${replayData.tickrate.toFixed(2)}
    `;
    playbackTime = 0;
    isPlaying = false;
  } catch (err) {
    console.error('Replay parse error:', err);
    alert(err.message);
  }
});

/**
 * 7) PLAYBACK CONTROLS
 */
playBtn.addEventListener('click', () => {
  isPlaying = true;
});
pauseBtn.addEventListener('click', () => {
  isPlaying = false;
});
resetBtn.addEventListener('click', () => {
  playbackTime = 0;
});

/**
 * 8) ANIMATION
 */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (replayData && isPlaying) {
    playbackTime += delta; // actual time in seconds
    let index = Math.floor(playbackTime / frameTime);
    const maxIndex = replayData.frames.length - 1;

    // Allow last frame to display
    if (index > maxIndex) {
      index = maxIndex;
      // Optionally stop playback if desired:
      // isPlaying = false;
    }

    const next = Math.min(index + 1, maxIndex);
    const t = (playbackTime / frameTime) - index;

    const f1 = replayData.frames[index];
    const f2 = replayData.frames[next];

    // Interpolate
    const x = THREE.MathUtils.lerp(f1.origin.x, f2.origin.x, t);
    const y = THREE.MathUtils.lerp(f1.origin.y, f2.origin.y, t);
    const z = THREE.MathUtils.lerp(f1.origin.z, f2.origin.z, t);

    // zoneOffset is 2D from replayData.zoneOffset
    const zx = replayData.zoneOffset[0];
    const zy = replayData.zoneOffset[1];

    // For example, if you want X to become X, Y to become Z, etc.:
    camera.position.set(x + zx, z, -(y + zy));

    // angles
    const yaw = THREE.MathUtils.lerp(f1.angles.yaw, f2.angles.yaw, t);
    const pitch = THREE.MathUtils.lerp(f1.angles.pitch, f2.angles.pitch, t);

    camera.rotation.x = THREE.MathUtils.degToRad(-pitch);
    camera.rotation.y = THREE.MathUtils.degToRad(yaw - 90);
    camera.rotation.z = 0;
  }

  renderer.render(scene, camera);
}
animate();

/**
 * 9) WINDOW RESIZE
 */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
