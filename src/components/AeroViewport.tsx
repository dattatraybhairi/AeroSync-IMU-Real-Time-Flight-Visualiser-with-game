import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  createAirbusA350,
  createBoeing787,
  createBoeing747,
  createAirbusA380,
  createFighterJet,
  createStuntPlane,
  type AircraftInstance,
  type AircraftType,
} from '../three/aircraftModels';
import { createTerrainWorld, type TerrainWorldInstance } from '../three/terrainWorld';
import { degreesToRadians, type IMUData } from '../utils/imuMath';
import {
  stepFlightPhysics,
  getTerrainHeight,
  mapHardwareJoystick,
  INITIAL_FLIGHT_STATE,
  createInitialWaypoints,
  type FlightPositionState,
  type JoystickInput,
  type WaypointRing,
  type TerrainMode,
} from '../utils/flightPhysics';

export type { AircraftType, TerrainMode };
export type CameraPreset = 'isometric' | 'chase' | 'cockpit_front' | 'wing_view' | 'top' | 'side';

interface AeroViewportProps {
  imuData: IMUData;
  selectedAircraft: AircraftType;
  cameraPreset: CameraPreset;
  showAxes: boolean;
  showGrid: boolean;
  terrainMode: TerrainMode;
  darkMode?: boolean;
  remoteInput: JoystickInput;
  resetCounter: number;
  onFlightStateUpdate?: (state: FlightPositionState) => void;
}

export const AeroViewport: React.FC<AeroViewportProps> = ({
  imuData,
  selectedAircraft,
  cameraPreset,
  showAxes,
  showGrid,
  terrainMode,
  darkMode = false,
  remoteInput,
  resetCounter,
  onFlightStateUpdate,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const imuRef = useRef(imuData);
  imuRef.current = imuData;

  const selectedRef = useRef(selectedAircraft);
  selectedRef.current = selectedAircraft;

  const axesRef = useRef(showAxes);
  axesRef.current = showAxes;

  const gridRef = useRef(showGrid);
  gridRef.current = showGrid;

  const terrainModeRef = useRef<TerrainMode>(terrainMode);
  terrainModeRef.current = terrainMode;

  const remoteRef = useRef(remoteInput);
  remoteRef.current = remoteInput;

  const cameraPresetRef = useRef(cameraPreset);
  cameraPresetRef.current = cameraPreset;

  const onFlightStateUpdateRef = useRef(onFlightStateUpdate);
  onFlightStateUpdateRef.current = onFlightStateUpdate;

  const flightStateRef = useRef<FlightPositionState>({ ...INITIAL_FLIGHT_STATE });
  const waypointsRef = useRef<WaypointRing[]>(createInitialWaypoints());

  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const gridLightRef = useRef<THREE.GridHelper | null>(null);
  const gridDarkRef = useRef<THREE.GridHelper | null>(null);
  const axesGroupRef = useRef<THREE.Group | null>(null);
  const terrainWorldRef = useRef<TerrainWorldInstance | null>(null);
  const darkModeRef = useRef(darkMode);
  darkModeRef.current = darkMode;

  // Handle Reset to Runway trigger
  useEffect(() => {
    if (resetCounter === 0) return;
    const resetState = { ...INITIAL_FLIGHT_STATE };
    flightStateRef.current = resetState;
    waypointsRef.current = createInitialWaypoints();
    onFlightStateUpdateRef.current?.(resetState);

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls) {
      controls.target.set(resetState.x, resetState.y, resetState.z);
      camera.position.set(resetState.x, resetState.y + 3.2, resetState.z + 9.5);
      controls.update();
    }
  }, [resetCounter]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let isDisposed = false;
    let rafId = 0;
    let timeoutId = 0;

    // 1. Detect Software WebGL safely
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl =
          probeCanvas.getContext('webgl2') ||
          probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param) || '');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    // 2. Setup Scene with Alpine Sky / Night Cockpit Horizon Fog
    const scene = new THREE.Scene();
    const initialBg = darkModeRef.current ? 0x0b1528 : 0xbae6fd;
    scene.background = new THREE.Color(initialBg);
    scene.fog = new THREE.Fog(initialBg, 65, 225);
    sceneRef.current = scene;

    // 3. Setup Camera
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.2, 320);
    const initPos = flightStateRef.current;
    camera.position.set(initPos.x + 5.2, initPos.y + 3.2, initPos.z + 8.5);
    cameraRef.current = camera;

    // 4. Setup Renderer safely
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);
    container.appendChild(renderer.domElement);

    // 5. Studio Environment Reflection
    try {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
      const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTexture;
      pmremGenerator.dispose();
    } catch {
      // Fallback if PMREM fails on restricted WebGL context
    }

    // 6. Three-Point Studio & Sun Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x3f6212, 0.95);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffaf0, 1.75);
    dirLight.position.set(18, 32, 14);
    dirLight.castShadow = !isSoftwareGl;
    if (dirLight.shadow) {
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 1;
      dirLight.shadow.camera.far = 90;
      dirLight.shadow.camera.left = -22;
      dirLight.shadow.camera.right = 22;
      dirLight.shadow.camera.top = 22;
      dirLight.shadow.camera.bottom = -22;
      dirLight.shadow.bias = -0.0005;
      dirLight.shadow.normalBias = 0.02;
    }
    scene.add(dirLight);
    scene.add(dirLight.target);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.75);
    rimLight.position.set(-14, 10, -14);
    scene.add(rimLight);

    // 7. Procedural 3D Terrain World (Mountains & Trees OR Clouds-Only Sky Deck)
    const terrainWorld = createTerrainWorld(isSoftwareGl, waypointsRef.current);
    terrainWorld.group.visible = terrainModeRef.current !== 'off';
    scene.add(terrainWorld.group);
    terrainWorldRef.current = terrainWorld;

    // 8. Ground Grids (Light & Dark) & Contact Shadow Disc under active aircraft
    const gridLight = new THREE.GridHelper(120, 60, 0x94a3b8, 0xcbd5e1);
    gridLight.position.y = -1.95;
    scene.add(gridLight);
    gridLightRef.current = gridLight;

    const gridDark = new THREE.GridHelper(120, 60, 0x334155, 0x1e293b);
    gridDark.position.y = -1.95;
    scene.add(gridDark);
    gridDarkRef.current = gridDark;

    const shadowDiscGeo = new THREE.CircleGeometry(3.2, 24);
    shadowDiscGeo.rotateX(-Math.PI / 2);
    const shadowDiscMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const shadowDisc = new THREE.Mesh(shadowDiscGeo, shadowDiscMat);
    shadowDisc.position.set(initPos.x, -1.94, initPos.z);
    scene.add(shadowDisc);

    // 9. 3D Attitude Gimbal Rings around the active aircraft
    const axesGroup = new THREE.Group();
    const ringPitchGeo = new THREE.TorusGeometry(2.8, 0.014, 10, 64);
    ringPitchGeo.rotateY(Math.PI / 2);
    const ringPitchMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.48,
    });
    axesGroup.add(new THREE.Mesh(ringPitchGeo, ringPitchMat));

    const ringRollGeo = new THREE.TorusGeometry(2.8, 0.014, 10, 64);
    const ringRollMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.48,
    });
    axesGroup.add(new THREE.Mesh(ringRollGeo, ringRollMat));

    const ringYawGeo = new THREE.TorusGeometry(2.8, 0.014, 10, 64);
    ringYawGeo.rotateX(Math.PI / 2);
    const ringYawMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.48,
    });
    axesGroup.add(new THREE.Mesh(ringYawGeo, ringYawMat));

    axesGroup.position.set(initPos.x, initPos.y, initPos.z);
    scene.add(axesGroup);
    axesGroupRef.current = axesGroup;

    // 10. Instantiate Fleet Models (Strictly ONE active/visible at any moment)
    const fleet: Record<AircraftType, AircraftInstance> = {
      airbus_a350: createAirbusA350(),
      boeing_787: createBoeing787(),
      boeing_747: createBoeing747(),
      airbus_a380: createAirbusA380(),
      fighter_jet: createFighterJet(),
      stunt_plane: createStuntPlane(),
    };

    (Object.values(fleet) as AircraftInstance[]).forEach((aircraft) => {
      aircraft.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = !isSoftwareGl;
          obj.receiveShadow = !isSoftwareGl;
        }
      });
      aircraft.group.position.set(initPos.x, initPos.y, initPos.z);
      aircraft.group.visible = aircraft.type === selectedRef.current;
      scene.add(aircraft.group);
    });

    // 11. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 42;
    controls.minDistance = 2.5;
    controls.target.set(initPos.x, initPos.y, initPos.z);
    controls.update();
    controlsRef.current = controls;

    // 12. Global Keyboard Listener (WASD / Arrow Keys for Forward, Backward, Left, Right)
    const heldKeys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement | null)?.tagName;
      if (targetTag && ['INPUT', 'SELECT', 'TEXTAREA'].includes(targetTag)) return;
      if (!e.key) return;
      heldKeys.add(e.key.toLowerCase());
      if (e.key === 'r' || e.key === 'R') {
        const resetState = { ...INITIAL_FLIGHT_STATE };
        flightStateRef.current = resetState;
        waypointsRef.current = createInitialWaypoints();
        onFlightStateUpdateRef.current?.(resetState);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.key) return;
      heldKeys.delete(e.key.toLowerCase());
    };
    const onWindowBlur = () => {
      heldKeys.clear();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);

    if (!isSoftwareGl) {
      try {
        renderer.compile(scene, camera);
      } catch {
        // Ignore shader pre-warm issues
      }
    }

    // 13. Pre-allocated Math Scratch Objects (Zero GC in loop)
    const clock = new THREE.Clock();
    const targetQuat = new THREE.Quaternion();
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const prevPlanePos = new THREE.Vector3(initPos.x, initPos.y, initPos.z);
    const currPlanePos = new THREE.Vector3(initPos.x, initPos.y, initPos.z);
    const deltaMove = new THREE.Vector3();
    let lastHudSyncTime = 0;
    let totalElapsed = 0;

    function afterDraw(cb: () => void) {
      if (isDisposed) return;
      try {
        const gl = renderer.getContext() as WebGL2RenderingContext | null;
        if (!gl || gl.isContextLost() || typeof gl.fenceSync !== 'function') {
          timeoutId = window.setTimeout(cb, 70);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        if (!sync) {
          timeoutId = window.setTimeout(cb, 70);
          return;
        }
        const poll = () => {
          if (isDisposed) return;
          try {
            if (gl.isContextLost()) return;
            const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
            if (state === gl.UNSIGNALED) {
              timeoutId = window.setTimeout(poll, 5);
            } else {
              gl.deleteSync(sync);
              timeoutId = window.setTimeout(cb, 70);
            }
          } catch {
            timeoutId = window.setTimeout(cb, 70);
          }
        };
        timeoutId = window.setTimeout(poll, 5);
      } catch {
        timeoutId = window.setTimeout(cb, 70);
      }
    }

    function animateLoop() {
      if (isDisposed) return;
      const delta = Math.min(clock.getDelta(), 0.08);
      totalElapsed += delta;

      // Combine held keyboard keys (W/S/A/D or Arrow keys) with remoteInput
      let keyJoyX = 0;
      let keyJoyY = 0;
      if (heldKeys.has('w') || heldKeys.has('arrowup')) keyJoyY += 1.0;
      if (heldKeys.has('s') || heldKeys.has('arrowdown')) keyJoyY -= 1.0;
      if (heldKeys.has('d') || heldKeys.has('arrowright')) keyJoyX += 1.0;
      if (heldKeys.has('a') || heldKeys.has('arrowleft')) keyJoyX -= 1.0;

      const baseRemote = remoteRef.current;
      const effectiveRemote: JoystickInput = {
        ...baseRemote,
        joyX: Math.abs(keyJoyX) > Math.abs(baseRemote.joyX) ? keyJoyX : baseRemote.joyX,
        joyY: Math.abs(keyJoyY) > Math.abs(baseRemote.joyY) ? keyJoyY : baseRemote.joyY,
        boost: baseRemote.boost || heldKeys.has('shift'),
      };

      const { pitch, roll } = imuRef.current;
      const currentTerrainMode = terrainModeRef.current;

      // Step 3D flight position physics (forward, backward, sideways left/right, altitude)
      prevPlanePos.set(
        flightStateRef.current.x,
        flightStateRef.current.y,
        flightStateRef.current.z
      );
      const nextFlight = stepFlightPhysics(
        flightStateRef.current,
        imuRef.current,
        effectiveRemote,
        delta,
        waypointsRef.current,
        currentTerrainMode
      );
      flightStateRef.current = nextFlight;
      currPlanePos.set(nextFlight.x, nextFlight.y, nextFlight.z);

      // Compute visual bank roll & dynamic heading
      const mappedHw = mapHardwareJoystick(imuRef.current, effectiveRemote);
      const sidewaysStick =
        Math.abs(effectiveRemote.joyX) >= Math.abs(mappedHw.joyX)
          ? effectiveRemote.joyX
          : mappedHw.joyX;

      const visualRoll = Math.max(
        -85,
        Math.min(85, roll + sidewaysStick * 18)
      );
      const pRad = degreesToRadians(pitch);
      const rRad = degreesToRadians(visualRoll);
      const yRad = degreesToRadians(nextFlight.headingDeg);

      // Aeronautical YXZ Euler order (Forward = -Z)
      euler.set(pRad, -yRad, -rRad, 'YXZ');
      targetQuat.setFromEuler(euler);

      const currentSelected = selectedRef.current;
      const showAx = axesRef.current;
      const showGr = gridRef.current;
      const isDark = darkModeRef.current;

      if (terrainWorldRef.current) {
        terrainWorldRef.current.update(
          delta,
          totalElapsed,
          waypointsRef.current,
          currPlanePos,
          currentTerrainMode
        );
      }

      if (gridLightRef.current) gridLightRef.current.visible = showGr && !isDark;
      if (gridDarkRef.current) gridDarkRef.current.visible = showGr && isDark;
      if (axesGroupRef.current) axesGroupRef.current.visible = showAx;

      const slerpFactor = isSoftwareGl ? 0.35 : 0.22;

      // Enforce ONLY ONE aircraft visible and active at a time
      (Object.keys(fleet) as AircraftType[]).forEach((key) => {
        const instance = fleet[key];
        const isCurrent = key === currentSelected;
        instance.group.visible = isCurrent;
        if (isCurrent) {
          instance.group.position.copy(currPlanePos);
          instance.group.quaternion.slerp(targetQuat, slerpFactor);
          instance.animate?.(delta, pitch, visualRoll, nextFlight.headingDeg);
        }
      });

      if (axesGroupRef.current) {
        axesGroupRef.current.position.copy(currPlanePos);
        axesGroupRef.current.quaternion.slerp(targetQuat, slerpFactor);
      }

      // Ground contact shadow disc directly below aircraft on mountain terrain only
      shadowDisc.visible = currentTerrainMode === 'mountains';
      if (currentTerrainMode === 'mountains') {
        const groundY = getTerrainHeight(currPlanePos.x, currPlanePos.z);
        shadowDisc.position.set(currPlanePos.x, groundY + 0.05, currPlanePos.z);
        const altAboveGround = Math.max(0, currPlanePos.y - groundY);
        shadowDiscMat.opacity = Math.max(0.06, 0.32 - altAboveGround * 0.01);
      }

      // Keep sun shadow frustum centered on aircraft
      dirLight.position.set(currPlanePos.x + 18, currPlanePos.y + 28, currPlanePos.z + 14);
      dirLight.target.position.copy(currPlanePos);

      // Move camera & OrbitControls target smoothly with the aircraft ONLY when it actually translates
      deltaMove.subVectors(currPlanePos, prevPlanePos);
      const moveSq = deltaMove.lengthSq();
      if (moveSq > 1e-7 && moveSq < 10000) {
        camera.position.add(deltaMove);
        controls.target.add(deltaMove);
      } else if (moveSq >= 10000) {
        // World-wrap jump (> 100m in a single step): preserve exact camera offset relative to target
        const camOffset = camera.position.clone().sub(controls.target);
        controls.target.copy(currPlanePos);
        camera.position.copy(currPlanePos).add(camOffset);
      }

      controls.update();
      renderer.render(scene, camera);

      // Throttle React HUD state updates to ~10 Hz
      const now = performance.now();
      if (now - lastHudSyncTime > 95) {
        lastHudSyncTime = now;
        onFlightStateUpdateRef.current?.(nextFlight);
      }

      if (isSoftwareGl) {
        afterDraw(animateLoop);
      } else {
        rafId = requestAnimationFrame(animateLoop);
      }
    }

    animateLoop();

    const handleResize = () => {
      if (!container || isDisposed) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      isDisposed = true;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Dynamically switch 3D Scene Sky & Fog when darkMode changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const bgHex = darkMode ? 0x0b1528 : 0xbae6fd;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.Fog(bgHex, 65, 225);
  }, [darkMode]);

  // Update Camera Preset relative to active aircraft position
  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const dist = 9.2;
    const pos = flightStateRef.current;
    const targetY = pos.y;

    switch (cameraPreset) {
      case 'isometric':
        camera.position.set(pos.x + dist * 0.72, pos.y + dist * 0.42, pos.z - dist * 0.75);
        controls.target.set(pos.x, targetY, pos.z);
        break;
      case 'chase':
        camera.position.set(pos.x, pos.y + dist * 0.34, pos.z + dist * 0.98);
        controls.target.set(pos.x, targetY, pos.z);
        break;
      case 'cockpit_front':
        camera.position.set(pos.x, pos.y + 0.45, pos.z - dist * 0.92);
        controls.target.set(pos.x, targetY, pos.z);
        break;
      case 'wing_view':
        camera.position.set(pos.x + dist * 0.9, pos.y + 0.55, pos.z - 1.2);
        controls.target.set(pos.x, targetY, pos.z);
        break;
      case 'top':
        camera.position.set(pos.x, pos.y + dist * 1.45, pos.z + 0.01);
        controls.target.set(pos.x, pos.y, pos.z);
        break;
      case 'side':
        camera.position.set(pos.x + dist * 1.1, pos.y + 0.2, pos.z);
        controls.target.set(pos.x, targetY, pos.z);
        break;
    }
    camera.updateProjectionMatrix();
    controls.update();
  }, [cameraPreset]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden">
      <div
        ref={mountRef}
        data-testid="threejs-canvas-mount"
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />
    </div>
  );
};
