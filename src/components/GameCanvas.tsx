import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useGame } from "@/lib/game-store";
import { touchControls } from "@/lib/touch-controls";

/**
 * Iron Hero: Sky Assault — vanilla Three.js implementation.
 * Endless flying shooter with procedural recycling city.
 */
export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(useGame.getState());

  // keep a live ref to store
  useEffect(() => useGame.subscribe((s) => (stateRef.current = s)), []);

  useEffect(() => {
    const mount = mountRef.current!;
    const width = () => mount.clientWidth;
    const height = () => mount.clientHeight;

    // ---------- Renderer ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(width(), height());
    renderer.setClearColor(0x0a0a12);
    mount.appendChild(renderer.domElement);

    // ---------- Scene ----------
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x1a0a10, 120, 600);

    const camera = new THREE.PerspectiveCamera(70, width() / height(), 0.5, 1500);
    camera.position.set(0, 8, 18);

    // Lights
    scene.add(new THREE.HemisphereLight(0xffb0a0, 0x202040, 0.7));
    const sun = new THREE.DirectionalLight(0xffddbb, 1.0);
    sun.position.set(50, 100, 30);
    scene.add(sun);

    // Sky gradient dome
    const skyGeo = new THREE.SphereGeometry(1000, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { top: { value: new THREE.Color(0x0a0518) }, bot: { value: new THREE.Color(0xff3355) } },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bot; void main(){ float h = normalize(vP).y*0.5+0.5; gl_FragColor = vec4(mix(bot, top, pow(h,0.7)), 1.0); }`,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Ground plane far below
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshBasicMaterial({ color: 0x08080f })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -50;
    scene.add(ground);

    // ---------- Player ----------
    // Built so local forward = -Z (matches flight direction). Yaw/pitch/roll applied in loop.
    const player = new THREE.Group();
    player.rotation.order = "YXZ";
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcc1a1a, metalness: 0.8, roughness: 0.3, emissive: 0x330000 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd44a, metalness: 0.9, roughness: 0.25, emissive: 0x221500 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.4, 6, 12), bodyMat);
    body.rotation.x = Math.PI / 2; // lay capsule along Z
    player.add(body);
    // Head (nose points -Z)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), goldMat);
    head.position.set(0, 0.15, -1.1);
    player.add(head);
    // Arms — extended forward like Iron Man flight pose
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), bodyMat);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(s * 0.75, -0.1, -0.2);
      player.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), goldMat);
      hand.position.set(s * 0.75, -0.1, -0.9);
      player.add(hand);
      // repulsor glow in palm
      const palm = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x99ddff })
      );
      palm.position.set(s * 0.75, -0.15, -1.05);
      player.add(palm);
    }
    // Legs & thrusters (behind, +Z)
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.9, 4, 8), bodyMat);
      leg.rotation.x = Math.PI / 2;
      leg.position.set(s * 0.3, -0.05, 0.9);
      player.add(leg);
      const th = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 1.2, 10),
        new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9 })
      );
      th.rotation.x = -Math.PI / 2; // point +Z (backwards)
      th.position.set(s * 0.3, -0.05, 1.7);
      (th as any).userData.thruster = true;
      player.add(th);
    }
    scene.add(player);

    // Player state
    const pVel = new THREE.Vector3();
    const pPos = new THREE.Vector3(0, 20, 0);
    let bank = 0;
    let pitch = 0;
    let speed = 40; // forward speed (auto)
    const baseSpeed = 40;
    const boostSpeed = 90;

    // ---------- City (recycling chunks) ----------
    type Building = { mesh: THREE.Mesh; box: THREE.Box3 };
    const buildings: Building[] = [];
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.7, metalness: 0.4 });
    const buildingMatLit = new THREE.MeshStandardMaterial({ color: 0x3a3a55, roughness: 0.5, metalness: 0.5, emissive: 0xff4466, emissiveIntensity: 0.15 });

    const CITY_SPAN = 800;
    const CITY_HALFW = 90;
    const NUM_BUILDINGS = 90;
    for (let i = 0; i < NUM_BUILDINGS; i++) {
      const w = 6 + Math.random() * 10;
      const d = 6 + Math.random() * 10;
      const h = 15 + Math.random() * 70;
      const mat = Math.random() > 0.6 ? buildingMatLit : buildingMat;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(
        (Math.random() - 0.5) * CITY_HALFW * 2,
        h / 2 - 40,
        -Math.random() * CITY_SPAN
      );
      scene.add(mesh);
      buildings.push({ mesh, box: new THREE.Box3().setFromObject(mesh) });
    }
    const recycleBuilding = (b: Building) => {
      const w = 6 + Math.random() * 10;
      const d = 6 + Math.random() * 10;
      const h = 15 + Math.random() * 70;
      b.mesh.geometry.dispose();
      b.mesh.geometry = new THREE.BoxGeometry(w, h, d);
      b.mesh.position.set(
        (Math.random() - 0.5) * CITY_HALFW * 2,
        h / 2 - 40,
        pPos.z - CITY_SPAN - Math.random() * 100
      );
      b.box.setFromObject(b.mesh);
    };

    // ---------- Enemies (object pool) ----------
    type Enemy = { mesh: THREE.Mesh; vel: THREE.Vector3; hp: number; alive: boolean; kind: "drone" | "tank" };
    const enemies: Enemy[] = [];
    const droneGeo = new THREE.IcosahedronGeometry(0.9, 0);
    const droneMat = new THREE.MeshStandardMaterial({ color: 0x333344, emissive: 0xff2222, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.4 });
    const tankGeo = new THREE.BoxGeometry(2.2, 1.2, 2.2);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x552222, emissive: 0xff5522, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.5 });

    const spawnEnemy = () => {
      const kind: "drone" | "tank" = Math.random() < 0.85 ? "drone" : "tank";
      let e = enemies.find((x) => !x.alive && x.kind === kind);
      if (!e) {
        const mesh = new THREE.Mesh(kind === "drone" ? droneGeo : tankGeo, kind === "drone" ? droneMat : tankMat);
        scene.add(mesh);
        e = { mesh, vel: new THREE.Vector3(), hp: 1, alive: false, kind };
        enemies.push(e);
      }
      e.alive = true;
      e.hp = kind === "drone" ? 1 : 4;
      e.mesh.visible = true;
      e.mesh.position.set(
        pPos.x + (Math.random() - 0.5) * 60,
        pPos.y + (Math.random() - 0.5) * 25,
        pPos.z - 200 - Math.random() * 100
      );
      e.vel.set(0, 0, 0);
    };

    // ---------- Bullets (pool) ----------
    type Bullet = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; alive: boolean };
    const bullets: Bullet[] = [];
    const bulletGeo = new THREE.SphereGeometry(0.18, 6, 6);
    const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    const fireBullet = () => {
      let b = bullets.find((x) => !x.alive);
      if (!b) {
        const mesh = new THREE.Mesh(bulletGeo, bulletMat);
        scene.add(mesh);
        b = { mesh, vel: new THREE.Vector3(), life: 0, alive: false };
        bullets.push(b);
      }
      b.alive = true;
      b.mesh.visible = true;
      b.life = 1.5;
      b.mesh.position.copy(pPos);
      const forward = new THREE.Vector3(0, 0, -1);
      b.vel.copy(forward).multiplyScalar(180).add(pVel.clone().multiplyScalar(0.3));
      b.mesh.position.z -= 2;
    };

    // ---------- Fuel pickups ----------
    type Pickup = { mesh: THREE.Mesh; alive: boolean };
    const pickups: Pickup[] = [];
    const fuelGeo = new THREE.OctahedronGeometry(0.9, 0);
    const fuelMat = new THREE.MeshStandardMaterial({ color: 0x22ff88, emissive: 0x22ff88, emissiveIntensity: 1.2 });
    const spawnFuel = () => {
      let p = pickups.find((x) => !x.alive);
      if (!p) {
        const mesh = new THREE.Mesh(fuelGeo, fuelMat);
        scene.add(mesh);
        p = { mesh, alive: false };
        pickups.push(p);
      }
      p.alive = true;
      p.mesh.visible = true;
      p.mesh.position.set(
        pPos.x + (Math.random() - 0.5) * 30,
        pPos.y + (Math.random() - 0.5) * 15,
        pPos.z - 150 - Math.random() * 100
      );
    };

    // ---------- Explosions (particle bursts) ----------
    type Explosion = { pts: THREE.Points; vels: Float32Array; life: number; alive: boolean };
    const explosions: Explosion[] = [];
    const explode = (pos: THREE.Vector3, color = 0xff6622) => {
      const N = 20;
      const g = new THREE.BufferGeometry();
      const positions = new Float32Array(N * 3);
      const vels = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;
        vels[i * 3] = (Math.random() - 0.5) * 20;
        vels[i * 3 + 1] = (Math.random() - 0.5) * 20;
        vels[i * 3 + 2] = (Math.random() - 0.5) * 20;
      }
      g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.6, transparent: true, opacity: 1 }));
      scene.add(pts);
      explosions.push({ pts, vels, life: 0.8, alive: true });
    };

    // ---------- Input ----------
    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (e.code === "KeyP" || e.code === "Escape") {
        const s = stateRef.current;
        if (s.state === "playing") s.setState("paused");
        else if (s.state === "paused") s.setState("playing");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const mouse = { x: 0, y: 0, down: false };
    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };
    const onMouseDown = () => { mouse.down = true; };
    const onMouseUp = () => { mouse.down = false; };
    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    // Touch — simple: left half = joystick, right half = shoot; two-finger = boost
    const touch = { active: false, cx: 0, cy: 0, x: 0, y: 0, shoot: false, boost: false };
    const onTouchStart = (e: TouchEvent) => {
      for (const t of Array.from(e.touches)) {
        const rect = renderer.domElement.getBoundingClientRect();
        const rx = t.clientX - rect.left;
        if (rx < rect.width / 2) {
          touch.active = true;
          touch.cx = rx; touch.cy = t.clientY - rect.top;
          touch.x = 0; touch.y = 0;
        } else {
          touch.shoot = true;
        }
      }
      if (e.touches.length >= 3) touch.boost = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      for (const t of Array.from(e.touches)) {
        const rx = t.clientX - rect.left;
        if (rx < rect.width / 2 && touch.active) {
          const dx = rx - touch.cx;
          const dy = (t.clientY - rect.top) - touch.cy;
          const max = 60;
          touch.x = Math.max(-1, Math.min(1, dx / max));
          touch.y = Math.max(-1, Math.min(1, dy / max));
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) { touch.active = false; touch.shoot = false; touch.boost = false; touch.x = 0; touch.y = 0; }
    };
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
    renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: true });
    renderer.domElement.addEventListener("touchend", onTouchEnd, { passive: true });

    // ---------- Audio (WebAudio simple synth) ----------
    let audio: AudioContext | null = null;
    const ensureAudio = () => {
      if (!audio) { try { audio = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch {} }
      return audio;
    };
    const beep = (freq: number, dur = 0.08, type: OscillatorType = "square", vol = 0.05) => {
      const ac = ensureAudio(); if (!ac) return;
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.value = vol; o.connect(g); g.connect(ac.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.stop(ac.currentTime + dur);
    };

    // ---------- Loop ----------
    let last = performance.now();
    let fireCd = 0;
    let spawnCd = 0;
    let fuelCd = 3;
    let fpsAcc = 0, fpsFrames = 0, fpsTimer = 0;
    let running = true;

    const onResize = () => {
      renderer.setSize(width(), height());
      camera.aspect = width() / height();
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    const tmpBox = new THREE.Box3();

    const loop = () => {
      if (!running) return;
      requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const s = stateRef.current;

      // FPS
      fpsFrames++; fpsTimer += dt;
      if (fpsTimer >= 0.5) { s.setFps(Math.round(fpsFrames / fpsTimer)); fpsFrames = 0; fpsTimer = 0; }

      if (s.state !== "playing") {
        renderer.render(scene, camera);
        return;
      }

      // Input axes
      let ax = 0, ay = 0;
      if (keys["KeyA"] || keys["ArrowLeft"]) ax -= 1;
      if (keys["KeyD"] || keys["ArrowRight"]) ax += 1;
      if (keys["KeyW"] || keys["ArrowUp"]) ay -= 1;
      if (keys["KeyS"] || keys["ArrowDown"]) ay += 1;
      // mouse steering
      ax += mouse.x * 0.8;
      ay -= mouse.y * 0.8;
      // touch (native gestures + on-screen controls)
      ax += touch.x + touchControls.x;
      ay += touch.y + touchControls.y;
      ax = Math.max(-1, Math.min(1, ax));
      ay = Math.max(-1, Math.min(1, ay));

      const boosting = keys["Space"] || touch.boost || touchControls.boost;
      const targetSpeed = boosting ? boostSpeed : baseSpeed;
      speed += (targetSpeed - speed) * Math.min(1, dt * 3);

      // Velocity
      pVel.x += (ax * 40 - pVel.x) * Math.min(1, dt * 4);
      pVel.y += (-ay * 30 - pVel.y) * Math.min(1, dt * 4);
      pVel.z = -speed;

      pPos.addScaledVector(pVel, dt);
      pPos.y = Math.max(-30, Math.min(80, pPos.y));

      // Orient the body toward the actual velocity direction.
      const horizSpeed = Math.hypot(pVel.x, pVel.z) || 0.0001;
      const targetYaw = Math.atan2(-pVel.x, -pVel.z); // forward is -Z
      const targetPitch = Math.atan2(pVel.y, horizSpeed) * 0.8;
      const targetBank = -ax * 0.6; // roll into turns
      // Smooth toward targets (unwrap yaw so we lerp the shortest way)
      let dyaw = targetYaw - player.rotation.y;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      const yawNext = player.rotation.y + dyaw * Math.min(1, dt * 6);
      pitch += (targetPitch - pitch) * Math.min(1, dt * 5);
      bank += (targetBank - bank) * Math.min(1, dt * 5);
      player.position.copy(pPos);
      player.rotation.set(pitch, yawNext, bank);

      // Thruster flicker
      player.traverse((o: any) => { if (o.userData?.thruster) o.scale.y = 0.7 + Math.random() * 0.6 + (boosting ? 0.8 : 0); });

      // Camera follow
      const camTarget = new THREE.Vector3(pPos.x * 0.3, pPos.y + 4, pPos.z + 16);
      camera.position.lerp(camTarget, Math.min(1, dt * 4));
      camera.lookAt(pPos.x * 0.5, pPos.y + 1, pPos.z - 10);
      camera.fov = boosting ? 82 : 70;
      camera.updateProjectionMatrix();
      if (boosting) {
        camera.position.x += (Math.random() - 0.5) * 0.3;
        camera.position.y += (Math.random() - 0.5) * 0.3;
      }

      // Fuel drain
      s.setFuel(s.fuel - (boosting ? 3 : 1.2) * dt);
      if (s.fuel <= 0) {
        explode(pPos, 0xff3300);
        beep(80, 0.6, "sawtooth", 0.15);
        s.setState("gameover");
      }

      // Distance score
      s.addScore(dt * 5);

      // Fire
      fireCd -= dt;
      if ((mouse.down || keys["KeyJ"] || touch.shoot || touchControls.shoot) && fireCd <= 0) {
        fireBullet();
        fireCd = 0.11;
        beep(880, 0.05, "square", 0.03);
      }

      // Spawns
      spawnCd -= dt;
      const difficulty = 1 + s.score / 3000;
      if (spawnCd <= 0) {
        spawnEnemy();
        spawnCd = Math.max(0.4, 1.6 / difficulty);
      }
      fuelCd -= dt;
      if (fuelCd <= 0) {
        spawnFuel();
        fuelCd = 4 + Math.random() * 3;
      }

      // Recycle buildings
      for (const b of buildings) {
        if (b.mesh.position.z > pPos.z + 60) recycleBuilding(b);
      }

      // Bullets
      for (const b of bullets) {
        if (!b.alive) continue;
        b.mesh.position.addScaledVector(b.vel, dt);
        b.life -= dt;
        if (b.life <= 0 || b.mesh.position.z < pPos.z - 300) { b.alive = false; b.mesh.visible = false; }
      }

      // Enemies
      for (const e of enemies) {
        if (!e.alive) continue;
        // move toward player slowly
        const dir = new THREE.Vector3().subVectors(pPos, e.mesh.position).normalize();
        const enSpeed = (e.kind === "drone" ? 18 : 10) * difficulty;
        e.mesh.position.addScaledVector(dir, enSpeed * dt);
        e.mesh.rotation.y += dt * 2;
        // if passed player, recycle
        if (e.mesh.position.z > pPos.z + 40) { e.alive = false; e.mesh.visible = false; continue; }

        // Collide with bullets
        for (const b of bullets) {
          if (!b.alive) continue;
          if (b.mesh.position.distanceToSquared(e.mesh.position) < 2.2) {
            b.alive = false; b.mesh.visible = false;
            e.hp -= 1;
            if (e.hp <= 0) {
              explode(e.mesh.position, e.kind === "drone" ? 0xff6622 : 0xff2200);
              e.alive = false; e.mesh.visible = false;
              const gained = e.kind === "drone" ? 100 : 400;
              s.setCombo(s.combo + 1);
              s.addScore(gained * (1 + s.combo * 0.05));
              beep(220, 0.15, "sawtooth", 0.06);
            }
          }
        }
        // Collide with player
        if (e.alive && e.mesh.position.distanceToSquared(pPos) < 4) {
          explode(e.mesh.position, 0xff2200);
          e.alive = false; e.mesh.visible = false;
          s.setHealth(s.health - 20);
          s.setCombo(0);
          beep(120, 0.2, "square", 0.1);
          if (s.health <= 0) {
            explode(pPos, 0xff3300);
            s.setState("gameover");
          }
        }
      }

      // Building collisions (only near player)
      for (const b of buildings) {
        if (Math.abs(b.mesh.position.z - pPos.z) > 40) continue;
        tmpBox.setFromObject(b.mesh);
        if (tmpBox.containsPoint(pPos)) {
          explode(pPos, 0xff3300);
          s.setHealth(s.health - 40);
          s.setCombo(0);
          // bump player away
          pPos.y += 5;
          if (s.health <= 0) s.setState("gameover");
        }
      }

      // Pickups
      for (const p of pickups) {
        if (!p.alive) continue;
        p.mesh.rotation.y += dt * 3;
        p.mesh.rotation.x += dt * 2;
        if (p.mesh.position.z > pPos.z + 40) { p.alive = false; p.mesh.visible = false; continue; }
        if (p.mesh.position.distanceToSquared(pPos) < 6) {
          p.alive = false; p.mesh.visible = false;
          s.setFuel(s.fuel + 35);
          s.addScore(50);
          beep(1200, 0.15, "sine", 0.06);
        }
      }

      // Explosions
      for (let i = explosions.length - 1; i >= 0; i--) {
        const ex = explosions[i];
        ex.life -= dt;
        const pos = ex.pts.geometry.attributes.position as THREE.BufferAttribute;
        for (let j = 0; j < pos.count; j++) {
          pos.array[j * 3] += ex.vels[j * 3] * dt;
          pos.array[j * 3 + 1] += ex.vels[j * 3 + 1] * dt;
          pos.array[j * 3 + 2] += ex.vels[j * 3 + 2] * dt;
        }
        pos.needsUpdate = true;
        (ex.pts.material as THREE.PointsMaterial).opacity = Math.max(0, ex.life / 0.8);
        if (ex.life <= 0) {
          scene.remove(ex.pts);
          ex.pts.geometry.dispose();
          (ex.pts.material as THREE.Material).dispose();
          explosions.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    };

    // Start when state becomes playing
    const unsub = useGame.subscribe((s, prev) => {
      if (s.state === "playing" && prev.state !== "playing") {
        // reset world position when starting fresh
        if (prev.state === "menu" || prev.state === "gameover") {
          pPos.set(0, 20, 0);
          pVel.set(0, 0, 0);
          for (const e of enemies) { e.alive = false; e.mesh.visible = false; }
          for (const b of bullets) { b.alive = false; b.mesh.visible = false; }
          for (const p of pickups) { p.alive = false; p.mesh.visible = false; }
          buildings.forEach(recycleBuilding);
        }
        ensureAudio();
      }
    });

    requestAnimationFrame(loop);

    return () => {
      running = false;
      unsub();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      renderer.domElement.removeEventListener("touchmove", onTouchMove);
      renderer.domElement.removeEventListener("touchend", onTouchEnd);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" />;
}
