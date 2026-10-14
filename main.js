// main.js (module)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';

const canvasOverlay = document.getElementById('overlay');
const uiLevel = document.getElementById('level');
const uiScore = document.getElementById('score');

let scene, camera, renderer;
let rocket, earth;
let debrisList = [];
let lastSpawn = 0;
let spawnInterval = 2000; // ms
let destroyedCount = 0;
let level = 1;
let score = 0;
let clock = new THREE.Clock();

init();
animate();

function init() {
  scene = new THREE.Scene();

  const w = window.innerWidth, h = window.innerHeight;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 1);
  document.body.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 5000);
  camera.position.set(0, 6, 18);

  // Lights: ambient + hemisphere + directional + point near rocket
  const ambient = new THREE.AmbientLight(0x404050, 0.9); // soft ambient
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xaaaaee, 0x222233, 0.6);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(100, 100, 50);
  scene.add(dir);

  const point = new THREE.PointLight(0xffddcc, 1.2, 50, 2);
  point.position.set(0, 2, 6);
  scene.add(point);

  // Rocket (player)
  rocket = new THREE.Group();
  const bodyGeo = new THREE.CylinderGeometry(0.7, 0.9, 3.5, 12);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.4 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1;
  rocket.add(body);
  const coneGeo = new THREE.ConeGeometry(0.8, 1, 12);
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0x220000 }));
  cone.position.set(0, 3, 0);
  rocket.add(cone);

  // small engine glow (visual)
  const engineGeo = new THREE.SphereGeometry(0.35, 12, 8);
  const engineMat = new THREE.MeshBasicMaterial({ color: 0xffaa66 });
  const engine = new THREE.Mesh(engineGeo, engineMat);
  engine.position.set(0, -0.8, 0);
  rocket.add(engine);

  rocket.position.set(0, 0, 0);
  scene.add(rocket);

  // Earth (below)
  const texLoader = new THREE.TextureLoader();
  const earthTex = texLoader.load('https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg');
  const earthGeo = new THREE.SphereGeometry(80, 64, 64);
  const earthMat = new THREE.MeshStandardMaterial({ map: earthTex, roughness: 1 });
  earth = new THREE.Mesh(earthGeo, earthMat);
  earth.position.set(0, -350, 0);
  scene.add(earth);

  // Starfield: many bright points
  const starsGeo = new THREE.BufferGeometry();
  const starsCount = 6000;
  const positions = new Float32Array(starsCount * 3);
  const colors = new Float32Array(starsCount * 3);
  for (let i = 0; i < starsCount; i++) {
    const r = 800 + Math.random() * 1200;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = r * Math.cos(phi);
    const c = 0.8 + Math.random() * 0.5;
    colors[i*3] = colors[i*3+1] = colors[i*3+2] = c;
  }
  starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const starsMat = new THREE.PointsMaterial({ size: 1.2, vertexColors: true, sizeAttenuation: true });
  const stars = new THREE.Points(starsGeo, starsMat);
  scene.add(stars);

  // overlay canvas
  resizeOverlay();
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('keydown', onKeyDown);
}

function spawnDebris() {
  const size = 0.8 + Math.random() * 1.6;
  const geo = new THREE.IcosahedronGeometry(size, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5, roughness: 0.6 });
  const mesh = new THREE.Mesh(geo, mat);

  // Spawn in front of rocket with variety
  const distance = 200 + Math.random() * 220;
  const spread = 40 + level * 6;
  mesh.position.set((Math.random()-0.5)*spread, 20 + Math.random()*30, -distance);
  mesh.position.applyMatrix4(rocket.matrixWorld);

  // velocity towards rocket with some noise
  const dir = new THREE.Vector3().subVectors(rocket.position, mesh.position).normalize();
  const speed = 4 + Math.random() * 2 + (level - 1) * 1.2; // increases with level
  const velocity = dir.multiplyScalar(speed);

  scene.add(mesh);
  debrisList.push({ mesh, velocity, size, state: 'far' });
}

function onKeyDown(e) {
  if (e.code === 'Space') {
    pulseClean();
  }
}

function pulseClean() {
  const radius = 18;
  debrisList.forEach(d => {
    const dist = d.mesh.position.distanceTo(rocket.position);
    if (dist < radius) {
      d.state = 'dying';
      d.mesh.material = new THREE.MeshStandardMaterial({ color: 0x33ff66, emissive: 0x33ff66 });
      d.despawnAt = performance.now() + 400;
    }
  });
}

function updateLevelIfNeeded() {
  const nextLevelEvery = 6;
  const newLevel = Math.floor(destroyedCount / nextLevelEvery) + 1;
  if (newLevel !== level) {
    level = newLevel;
    spawnInterval = Math.max(400, 2000 - (level - 1) * 250);
    uiLevel.textContent = level;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const now = performance.now();

  if (now - lastSpawn > spawnInterval) {
    spawnDebris();
    lastSpawn = now;
  }

  for (let i = debrisList.length - 1; i >= 0; i--) {
    const d = debrisList[i];
    if (d.state === 'dying') {
      if (performance.now() > d.despawnAt) {
        scene.remove(d.mesh);
        debrisList.splice(i,1);
        destroyedCount++;
        score += 10;
        uiScore.textContent = score;
        updateLevelIfNeeded();
      } else {
        d.mesh.rotateX(dt * 1);
        d.mesh.rotateY(dt * 0.7);
      }
      continue;
    }

    d.mesh.position.addScaledVector(d.velocity, dt);
    d.mesh.rotateX(dt * 1.2);
    d.mesh.rotateY(dt * 0.9);

    const dist = d.mesh.position.distanceTo(rocket.position);

    if (dist < 12 && d.state !== 'near') {
      d.state = 'near';
      d.mesh.material = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0x440000 });
    }

    if (dist < 2.2) {
      d.state = 'dying';
      d.mesh.material = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xaa2200 });
      d.despawnAt = performance.now() + 600;
      score = Math.max(0, score - 15);
      uiScore.textContent = score;
    }

    const rel = new THREE.Vector3().subVectors(d.mesh.position, rocket.position);
    if (rel.length() > 1200) {
      scene.remove(d.mesh);
      debrisList.splice(i,1);
    }
  }

  // camera follow rocket
  const t = performance.now() * 0.001;
  camera.position.lerp(new THREE.Vector3(0, 6 + Math.sin(t)*0.2, 18 + (level-1)*0.5), 0.03);
  camera.lookAt(rocket.position);

  renderer.render(scene, camera);

  drawOverlay();
}

function drawOverlay() {
  const c = canvasOverlay;
  const ctx = c.getContext('2d');
  c.width = window.innerWidth * devicePixelRatio;
  c.height = window.innerHeight * devicePixelRatio;
  c.style.width = window.innerWidth + 'px';
  c.style.height = window.innerHeight + 'px';
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  ctx.clearRect(0,0,window.innerWidth,window.innerHeight);

  const width = window.innerWidth, height = window.innerHeight;

  const projector = (vec3) => {
    const v = vec3.clone();
    v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, z: v.z };
  };

  debrisList.forEach(d => {
    const pos = d.mesh.position;
    const proj = projector(pos);
    const dist = pos.distanceTo(rocket.position);

    const onScreen = proj.x > 40 && proj.x < width-40 && proj.y > 40 && proj.y < height-40 && proj.z < 1 && proj.z > -1;
    if (!onScreen && dist > 60) {
      const cx = width/2, cy = height*0.6;
      const dx = proj.x - cx, dy = proj.y - cy;
      const ang = Math.atan2(dy, dx);
      const edgeX = cx + Math.cos(ang) * (Math.min(width, height)/2 - 60);
      const edgeY = cy + Math.sin(ang) * (Math.min(width, height)/2 - 60);

      ctx.save();
      ctx.translate(edgeX, edgeY);
      ctx.rotate(ang);
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-6, 8);
      ctx.lineTo(-6, -8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (dist <= 60 && dist > 10) {
      ctx.fillStyle = 'rgba(255,0,0,0.95)';
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 10, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔔', proj.x, proj.y);
    }

    if (d.state === 'dying') {
      const p = projector(d.mesh.position);
      ctx.fillStyle = 'rgba(50,200,80,0.95)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✔', p.x, p.y);
    }
  });

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(width/2, height*0.65, 28, 0, Math.PI*2);
  ctx.stroke();
}

function onWindowResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  resizeOverlay();
}

function resizeOverlay() {
  canvasOverlay.width = window.innerWidth * devicePixelRatio;
  canvasOverlay.height = window.innerHeight * devicePixelRatio;
  canvasOverlay.style.width = window.innerWidth + 'px';
  canvasOverlay.style.height = window.innerHeight + 'px';
  canvasOverlay.getContext('2d').setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
}
