// Three.js 3D board for the game page.
//
// The engine still lays out and draws the board with PixiJS; this module
// hides Pixi's canvas and shows that canvas as a live texture on a table in
// a Three.js scene. Pointer input still goes to Pixi: its interaction manager
// is given a position mapper that ray-casts from the screen onto the table
// and returns the matching board coordinate, so every gesture the engine
// understands (tap, drag to play, hold to zoom) works on the tilted table.
import * as THREE from "./three/three.module.min.js";

const STORAGE_KEY = "anra-view";
const TILT_3D = THREE.MathUtils.degToRad(26); // camera angle from straight down
const TILT_INTRO = THREE.MathUtils.degToRad(62);
const FOV = 34;
const BOARD_COLOR = 0x33ff33;

let enabled = readPreference() !== "2d" && !/[?&]view=2d\b/.test(location.search);

waitFor(() => window.cardRenderer && cardRenderer.app && cardRenderer.app.view.parentNode, start);

function start() {
  if (window.accessibilityMode === "text") return; // the text-only mode hides the board
  const board = new Board3D(cardRenderer.app);
  addToggle(board);
  if (enabled) board.enable(true);
}

class Board3D {
  constructor(pixiApp) {
    this.pixi = pixiApp;
    this.active = false;
    this.leaving = false;
    this.pointersDown = 0;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "anra-board3d";
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    // Only the table edges need antialiasing, and at 2x they barely do.
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: pixelRatio < 2, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050b07);
    this.scene.fog = new THREE.Fog(0x050b07, 3.2, 9);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();

    this.tilt = TILT_INTRO;
    this.targetTilt = TILT_3D;
    this.flatten = 0; // 0..1, used when leaving 3D so the hand-off to 2D is seamless
    this.clock = new THREE.Clock();

    this.buildTable();
    this.buildEnvironment();

    this.tick = this.tick.bind(this);
    this.onResize = this.onResize.bind(this);
    this.mapPositionToPoint = this.mapPositionToPoint.bind(this);
    this.interaction = pixiApp.renderer.plugins.interaction;

    // Moving the camera under a finger would move the board under it too,
    // so camera changes wait until no pointer is down.
    window.addEventListener("pointerdown", () => this.pointersDown++, true);
    const up = () => (this.pointersDown = Math.max(0, this.pointersDown - 1));
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  }

  buildTable() {
    // The board surface: Pixi's (transparent) canvas over a dark grid.
    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);

    this.feltTexture = new THREE.CanvasTexture(drawFelt());
    this.feltTexture.colorSpace = THREE.SRGBColorSpace;
    this.feltTexture.wrapS = this.feltTexture.wrapT = THREE.RepeatWrapping;
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.felt = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: this.feltTexture, fog: false }));
    this.boardGroup.add(this.felt);

    this.boardMaterial = new THREE.MeshBasicMaterial({ transparent: true, fog: false, depthWrite: false });
    this.surface = new THREE.Mesh(plane, this.boardMaterial);
    this.surface.position.y = 0.0005;
    this.surface.renderOrder = 1;
    this.boardGroup.add(this.surface);

    // Slab under the board with glowing edges.
    const slabGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.slab = new THREE.Mesh(slabGeometry, new THREE.MeshStandardMaterial({ color: 0x0a140d, roughness: 0.6, metalness: 0.4 }));
    this.boardGroup.add(this.slab);
    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(slabGeometry),
      new THREE.LineBasicMaterial({ color: BOARD_COLOR, transparent: true, opacity: 0.8 }),
    );
    this.boardGroup.add(this.edges);

    // Soft glow spilling from under the table onto the floor.
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: radialTexture("rgba(51,255,51,0.35)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(this.glow);

    this.scene.add(new THREE.AmbientLight(0x88ffaa, 0.6));
    const key = new THREE.DirectionalLight(0xccffdd, 1.4);
    key.position.set(-2, 4, 3);
    this.scene.add(key);
  }

  buildEnvironment() {
    const floorY = -0.45;
    const grid = new THREE.GridHelper(40, 160, BOARD_COLOR, 0x1d6b2a);
    grid.position.y = floorY;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.scene.add(grid);
    this.grid = grid;
    this.glow.position.y = floorY + 0.001;

    // Drifting data motes around the table.
    const count = 260;
    const positions = new Float32Array(count * 3);
    this.moteSpeeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = floorY + Math.random() * 3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
      this.moteSpeeds[i] = 0.05 + Math.random() * 0.15;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.motes = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: BOARD_COLOR,
        size: 0.035,
        map: radialTexture("rgba(255,255,255,1)"),
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.motes.userData.floorY = floorY;
    this.scene.add(this.motes);
  }

  enable(intro) {
    if (this.active) return;
    this.active = true;
    this.leaving = false;
    this.flatten = 0;
    this.tilt = intro ? TILT_INTRO : 0;
    this.targetTilt = TILT_3D;
    const view = this.pixi.view;
    view.parentNode.insertBefore(this.canvas, view);
    view.classList.add("anra-board3d-source");
    document.documentElement.classList.add("anra-3d");
    this.interaction.mapPositionToPoint = this.mapPositionToPoint;
    window.addEventListener("resize", this.onResize);
    this.onResize();
    this.clock.getDelta();
    // Run right after Pixi renders, while its drawing buffer is still valid.
    this.pixi.ticker.add(this.tick, null, PIXI.UPDATE_PRIORITY.UTILITY);
  }

  // Ease the camera flat, then hand the screen back to Pixi.
  disable() {
    if (!this.active) return;
    this.leaving = true;
    this.targetTilt = 0;
  }

  finishDisable() {
    this.active = false;
    this.leaving = false;
    this.pixi.ticker.remove(this.tick, null);
    delete this.interaction.mapPositionToPoint; // back to Pixi's own mapper
    window.removeEventListener("resize", this.onResize);
    this.pixi.view.classList.remove("anra-board3d-source");
    document.documentElement.classList.remove("anra-3d");
    this.canvas.remove();
  }

  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.canvas.style.width = window.innerWidth + "px";
    this.canvas.style.height = window.innerHeight + "px";
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.2);
    const t = this.clock.elapsedTime;

    // Pile and grid views (archives, choosing cards) are easier to read flat.
    if (!this.leaving && this.pointersDown === 0) {
      this.targetTilt = window.viewingPile || window.viewingGrid ? 0 : TILT_3D;
    }
    if (this.pointersDown === 0 || this.leaving) {
      this.tilt = damp(this.tilt, this.targetTilt, 4, dt);
    }
    if (this.leaving) {
      this.flatten = damp(this.flatten, 1, 4, dt);
      if (Math.abs(this.tilt) < 0.002 && this.flatten > 0.995) {
        this.finishDisable();
        return;
      }
    }

    this.updateBoardTexture();
    this.layoutTable();
    this.fitCamera();

    // Ambient motion.
    const pos = this.motes.geometry.attributes.position;
    const floorY = this.motes.userData.floorY;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + this.moteSpeeds[i] * dt;
      if (y > floorY + 3) y = floorY;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    this.grid.position.z = (t * 0.08) % 0.25;
    this.edges.material.opacity = 0.65 + 0.2 * Math.sin(t * 2);
    // Environment fades out as the view flattens to 2D.
    const env = 1 - this.flatten;
    this.motes.material.opacity = 0.7 * env;
    this.grid.material.opacity = 0.35 * env;

    this.renderer.render(this.scene, this.camera);
  }

  updateBoardTexture() {
    const source = this.pixi.view;
    if (!this.boardTexture || this.textureWidth !== source.width || this.textureHeight !== source.height) {
      // Texture storage is fixed-size, so a resized board needs a new texture.
      if (this.boardTexture) this.boardTexture.dispose();
      this.textureWidth = source.width;
      this.textureHeight = source.height;
      this.boardTexture = new THREE.CanvasTexture(source);
      this.boardTexture.colorSpace = THREE.SRGBColorSpace;
      this.boardTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.boardTexture.minFilter = THREE.LinearMipmapLinearFilter;
      this.boardMaterial.map = this.boardTexture;
      this.boardMaterial.needsUpdate = true;
    }
    this.boardTexture.needsUpdate = true;
  }

  // The table is one unit deep and as wide as the screen's aspect ratio,
  // so board UVs map straight onto Pixi's screen coordinates.
  layoutTable() {
    const screen = this.pixi.renderer.screen;
    const aspect = screen.width / screen.height;
    this.aspect = aspect;
    this.felt.scale.set(aspect, 1, 1);
    this.feltTexture.repeat.set(aspect * 10, 10);
    this.surface.scale.set(aspect, 1, 1);
    const thickness = 0.06;
    const lip = 0.02;
    this.slab.scale.set(aspect + lip, thickness, 1 + lip);
    this.slab.position.y = -thickness / 2 - 0.001;
    this.edges.scale.copy(this.slab.scale);
    this.edges.position.copy(this.slab.position);
    this.glow.scale.set(aspect * 2.2, 1, 2.6);
  }

  // Place the camera at the current tilt so the whole table fills as much of
  // the screen as possible, centred. Fully flat, this reproduces the 2D view
  // exactly, which is what makes switching back to 2D seamless.
  fitCamera() {
    const cam = this.camera;
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.fov = FOV;
    cam.updateProjectionMatrix();

    const halfW = this.aspect / 2;
    const corners = [
      new THREE.Vector3(-halfW, 0, -0.5),
      new THREE.Vector3(halfW, 0, -0.5),
      new THREE.Vector3(-halfW, 0, 0.5),
      new THREE.Vector3(halfW, 0, 0.5),
    ];
    const dir = new THREE.Vector3(0, Math.cos(this.tilt), Math.sin(this.tilt));
    const margin = THREE.MathUtils.lerp(0.97, 1, this.flatten);
    const p = new THREE.Vector3();

    const place = (dist) => {
      cam.position.copy(dir).multiplyScalar(dist);
      cam.up.set(0, 0, -1);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const c of corners) {
        p.copy(c).project(cam);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      return { minX, maxX, minY, maxY };
    };

    // Distance that makes the projected table just fit (binary search; the
    // projection's extent shrinks monotonically with distance).
    let lo = 0.1, hi = 30, box;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      box = place(mid);
      const cx = (box.minX + box.maxX) / 2;
      const fits = box.maxX - cx <= margin && (box.maxY - box.minY) / 2 <= margin;
      if (fits) hi = mid; else lo = mid;
    }
    box = place(hi);

    // Shift the projection (off-axis) to centre the table on screen.
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    cam.projectionMatrix.elements[8] += cx;
    cam.projectionMatrix.elements[9] += cy;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }

  // Replacement for Pixi's InteractionManager.mapPositionToPoint: screen
  // (client) coordinates in, Pixi screen coordinates out.
  mapPositionToPoint(point, x, y) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(TABLE_PLANE, HIT);
    const screen = this.pixi.renderer.screen;
    if (!hit) {
      point.x = point.y = -1e5;
      return;
    }
    point.x = (hit.x / this.aspect + 0.5) * screen.width;
    point.y = (hit.z + 0.5) * screen.height;
  }
}

const TABLE_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const HIT = new THREE.Vector3();

function addToggle(board) {
  const menubar = document.getElementById("menubar");
  if (!menubar) return;
  const button = document.createElement("button");
  button.className = "menu-trigger anra-view-toggle";
  const label = () => (button.textContent = enabled ? "2D" : "3D");
  label();
  button.title = "Switch between the 3D table and the flat board";
  button.addEventListener("click", () => {
    enabled = !enabled;
    try { localStorage.setItem(STORAGE_KEY, enabled ? "3d" : "2d"); } catch (e) {}
    if (enabled) board.enable(false); else board.disable();
    label();
  });
  menubar.appendChild(button);
}

function readPreference() {
  try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
}

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

function waitFor(condition, callback) {
  if (condition()) callback();
  else requestAnimationFrame(() => waitFor(condition, callback));
}

function drawFelt() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#0b1a10";
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "rgba(51,255,51,0.07)";
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, 63, 63);
  g.fillStyle = "rgba(51,255,51,0.18)";
  g.fillRect(0, 0, 2, 2);
  return c;
}

function radialTexture(color) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
