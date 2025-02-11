import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GUI } from 'dat.gui';
import { parseReplay } from './parseReplay.js';

// 1) SCENE SETUP
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaaaaaa);

// 2) CAMERA
// We'll interpret replay.x -> camera.x, replay.z -> camera.y, and -replay.y -> camera.z
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);
camera.rotation.order = 'YXZ'; // so we can set rotation.x, rotation.y in degrees

// 3) RENDERER
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 4) LIGHTS
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(1, 2, 3);
scene.add(dirLight);

const ambLight = new THREE.AmbientLight(0x404040);
scene.add(ambLight);

// 5) Fallback ground & grid (before map loads)
let infiniteGround = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshLambertMaterial({ color: 0x777777 })
);
infiniteGround.rotation.x = -Math.PI / 2;
scene.add(infiniteGround);

let gridHelper = new THREE.GridHelper(2000, 50);
scene.add(gridHelper);

// 6) GRAB HTML ELEMENTS
const mapInput = document.getElementById('mapFile');
const replayInput = document.getElementById('replayFile');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const headerInfo = document.getElementById('headerInfo');

// 7) TIMING
// Hardcode 100 tick, ignoring replay's embedded tickrate
const frameTime = 1 / 100;
let playbackSpeed = 1.0;

// 8) GLOBALS
let mapMesh = null;
let replayData = null;
let isPlaying = false;
let playbackTime = 0;

// 9) dat.GUI for adjusting map transform
const mapSettings = {
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  rotationY: 0,
  scale: 100
};

const gui = new GUI();
gui.add(mapSettings, 'offsetX', -10000, 10000, 1).name('Map Offset X').onChange(updateMapTransform);
gui.add(mapSettings, 'offsetY', -10000, 10000, 1).name('Map Offset Y').onChange(updateMapTransform);
gui.add(mapSettings, 'offsetZ', -10000, 10000, 1).name('Map Offset Z').onChange(updateMapTransform);
gui.add(mapSettings, 'rotationY', -Math.PI, Math.PI, 0.01).name('Map RotY').onChange(updateMapTransform);
gui.add(mapSettings, 'scale', 0.01, 1000, 1).name('Map Scale').onChange(updateMapTransform);

function updateMapTransform() {
  if (!mapMesh) return;
  mapMesh.position.set(mapSettings.offsetX, mapSettings.offsetY, mapSettings.offsetZ);
  mapMesh.rotation.y = mapSettings.rotationY;
  mapMesh.scale.set(mapSettings.scale, mapSettings.scale, mapSettings.scale);
}

// --------------------------------------------------------------------
// MAP LOADING (GLB)
// --------------------------------------------------------------------
mapInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const loader = new GLTFLoader();

  loader.load(
    url,
    (gltf) => {
      console.log('Map loaded:', gltf.scene);

      // Remove fallback ground & grid
      if (infiniteGround) {
        scene.remove(infiniteGround);
        infiniteGround = null;
      }
      if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper = null;
      }

      // Remove old map if any
      if (mapMesh) {
        scene.remove(mapMesh);
        mapMesh = null;
      }

      mapMesh = gltf.scene;

      // Optionally remove default cameras/cubes from the glTF
      mapMesh.traverse((child) => {
        if (child.name) {
          const lower = child.name.toLowerCase();
          if (lower.includes('camera') || lower.includes('cube')) {
            if (child.parent) child.parent.remove(child);
          }
        }
      });

      // Center the map by subtracting its bounding box center
      const box = new THREE.Box3().setFromObject(mapMesh);
      const center = new THREE.Vector3();
      box.getCenter(center);
      mapMesh.position.sub(center); // shift so center is at (0,0,0)

      // Apply current mapSettings
      updateMapTransform();

      scene.add(mapMesh);
      console.log('Map bounding box:', box, 'Center:', center);
    },
    undefined,
    (err) => {
      console.error('Error loading map:', err);
    }
  );
});

// --------------------------------------------------------------------
// REPLAY LOADING
// --------------------------------------------------------------------
replayInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    replayData = await parseReplay(file);
    console.log('Loaded replay:', replayData.mapName, 'frames:', replayData.frames.length);

    headerInfo.innerHTML = `
      <strong>Map:</strong> ${replayData.mapName}<br>
      <strong>Style:</strong> ${replayData.style}, <strong>Track:</strong> ${replayData.track}<br>
      <strong>Frames:</strong> ${replayData.frameCount}<br>
      <strong>Tickrate (ignored):</strong> ${replayData.tickrate}
    `;

    playbackTime = 0;
    isPlaying = false;
  } catch (err) {
    console.error('Replay parse error:', err);
    alert(err.message);
  }
});

// 10) PLAYBACK CONTROLS
playBtn.addEventListener('click', () => {
  isPlaying = true;
});
pauseBtn.addEventListener('click', () => {
  isPlaying = false;
});
resetBtn.addEventListener('click', () => {
  playbackTime = 0;
});

// --------------------------------------------------------------------
// ANIMATION LOOP
// --------------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (replayData && isPlaying) {
    playbackTime += delta * playbackSpeed;

    let index = Math.floor(playbackTime / frameTime);
    const maxIndex = replayData.frames.length - 1;
    if (index >= maxIndex) {
      // freeze at the last frame
      index = maxIndex - 1;
      playbackTime = index * frameTime;
    }

    const nextIndex = index + 1;
    const t = (playbackTime / frameTime) - index;

    const f1 = replayData.frames[index];
    const f2 = replayData.frames[nextIndex];

    // Interpolate
    const interpX = THREE.MathUtils.lerp(f1.origin.x, f2.origin.x, t);
    const interpY = THREE.MathUtils.lerp(f1.origin.z, f2.origin.z, t);
    const interpZ = THREE.MathUtils.lerp(f1.origin.y, f2.origin.y, t);

    camera.position.set(interpX, interpY, -interpZ);

    // Angles
    const yaw = THREE.MathUtils.lerp(f1.angles.yaw, f2.angles.yaw, t);
    const pitch = THREE.MathUtils.lerp(f1.angles.pitch, f2.angles.pitch, t);
    camera.rotation.x = THREE.MathUtils.degToRad(-pitch);
    camera.rotation.y = THREE.MathUtils.degToRad(yaw - 90);
    camera.rotation.z = 0;
  }

  // If no map is loaded, follow the camera with the infinite ground
  if (!mapMesh && infiniteGround && gridHelper) {
    infiniteGround.position.x = camera.position.x;
    infiniteGround.position.z = camera.position.z;
    gridHelper.position.x = camera.position.x;
    gridHelper.position.z = camera.position.z;
  }

  renderer.render(scene, camera);
}
animate();

// 11) HANDLE RESIZE
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
