import * as THREE from 'three';
import { getTerrainHeight, type TerrainMode, type WaypointRing } from '../utils/flightPhysics';

export interface TerrainWorldInstance {
  group: THREE.Group;
  waypointMeshes: THREE.Mesh[];
  update: (
    delta: number,
    elapsedTime: number,
    waypoints: WaypointRing[],
    aircraftPos: THREE.Vector3,
    terrainMode?: TerrainMode
  ) => void;
}

/**
 * Builds the complete 3D Flight Simulator Terrain World:
 * - Mode 1 ('mountains'): Vertex-colored Alpine Mountains, Foothills, Valley Floor,
 *   Airport Runway, 7-Part Control Tower, Hangar, 300+ Pine Trees, Boulders, High Clouds & Waypoint Rings.
 * - Mode 2 ('clouds_only'): Pure 3D Volumetric Cloud Sky Deck at flight altitudes with Waypoint Rings.
 * - Mode 3 ('off'): Hidden terrain.
 */
export function createTerrainWorld(
  isSoftwareGl: boolean,
  initialWaypoints: WaypointRing[]
): TerrainWorldInstance {
  const worldGroup = new THREE.Group();
  const groundTerrainGroup = new THREE.Group();
  const cloudsOnlyGroup = new THREE.Group();
  worldGroup.add(groundTerrainGroup);
  worldGroup.add(cloudsOnlyGroup);

  // 1. Procedural Vertex-Colored Mountain & Valley Terrain Mesh
  const terrainSize = 460;
  const segments = isSoftwareGl ? 88 : 128;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const colorTmp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = getTerrainHeight(vx, vz);
    posAttr.setY(i, vy);

    // Elevation-based biome vertex coloring
    const relH = vy + 2.0; // 0 = valley floor
    if (Math.abs(vx) < 11 && Math.abs(vz) < 42) {
      // Runway apron shoulder grass
      colorTmp.setHex(0x3f6a3e);
    } else if (relH < 0.8) {
      // Lush valley meadow green
      colorTmp.setHex(0x4b7f47);
    } else if (relH < 4.2) {
      // Alpine forest foothills
      colorTmp.setHex(0x3a663b);
    } else if (relH < 9.5) {
      // Granite mountain slope
      const t = (relH - 4.2) / 5.3;
      colorTmp.setHex(0x57534e).lerp(new THREE.Color(0x78716c), t);
    } else if (relH < 13.5) {
      // High rocky ridge
      colorTmp.setHex(0x94a3b8);
    } else {
      // Snow-capped mountain peak
      colorTmp.setHex(0xf8fafc);
    }

    colors[i * 3] = colorTmp.r;
    colors[i * 3 + 1] = colorTmp.g;
    colors[i * 3 + 2] = colorTmp.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.04,
    flatShading: true,
  });

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = !isSoftwareGl;
  groundTerrainGroup.add(terrainMesh);

  // 2. Alpine Lake / River Basin on the East/West Valley Flanks
  const waterGeo = new THREE.PlaneGeometry(terrainSize, terrainSize);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.2,
    metalness: 0.55,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = -2.28;
  groundTerrainGroup.add(waterMesh);

  // 3. Airport Runway Strip at (0, -1.97, 0) along Z axis [-38..+38]
  const runwayGroup = new THREE.Group();
  runwayGroup.position.set(0, -1.97, 0);

  const asphaltGeo = new THREE.PlaneGeometry(9.6, 78);
  asphaltGeo.rotateX(-Math.PI / 2);
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.82,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const asphaltMesh = new THREE.Mesh(asphaltGeo, asphaltMat);
  asphaltMesh.receiveShadow = !isSoftwareGl;
  runwayGroup.add(asphaltMesh);

  // Runway White Dashed Centerline & Side Stripes
  const stripeMat = new THREE.MeshBasicMaterial({
    color: 0xf8fafc,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  for (let z = -32; z <= 32; z += 5.5) {
    const dashGeo = new THREE.PlaneGeometry(0.28, 2.8);
    dashGeo.rotateX(-Math.PI / 2);
    const dash = new THREE.Mesh(dashGeo, stripeMat);
    dash.position.set(0, 0.02, z);
    runwayGroup.add(dash);
  }

  // Runway Threshold Piano Keys (North & South ends)
  for (const endZ of [-35.5, 35.5]) {
    for (let x = -3.6; x <= 3.6; x += 1.2) {
      if (Math.abs(x) < 0.3) continue;
      const keyGeo = new THREE.PlaneGeometry(0.55, 2.6);
      keyGeo.rotateX(-Math.PI / 2);
      const keyMesh = new THREE.Mesh(keyGeo, stripeMat);
      keyMesh.position.set(x, 0.02, endZ);
      runwayGroup.add(keyMesh);
    }
  }

  groundTerrainGroup.add(runwayGroup);

  // 4. Composite Air Traffic Control Tower & Hangar Complex
  const towerGroup = new THREE.Group();
  towerGroup.position.set(9.2, -2.0, -8);

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.75,
    metalness: 0.1,
  });
  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.4,
    metalness: 0.5,
  });
  const glassCabMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.15,
    metalness: 0.75,
    emissive: 0x0284c7,
    emissiveIntensity: 0.25,
  });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

  const baseBldg = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 4.2), concreteMat);
  baseBldg.position.set(0, 0.9, 0);
  towerGroup.add(baseBldg);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.15, 6.2, 8), concreteMat);
  shaft.position.set(0, 4.0, -1.0);
  towerGroup.add(shaft);

  const catwalk = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.35, 0.45, 8), darkTrimMat);
  catwalk.position.set(0, 7.2, -1.0);
  towerGroup.add(catwalk);

  const cab = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.25, 1.35, 8), glassCabMat);
  cab.position.set(0, 8.05, -1.0);
  towerGroup.add(cab);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.65, 0.65, 8), darkTrimMat);
  roof.position.set(0, 9.0, -1.0);
  towerGroup.add(roof);

  const radarPivot = new THREE.Group();
  radarPivot.position.set(0, 9.55, -1.0);
  const radarDish = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.18), concreteMat);
  radarPivot.add(radarDish);
  const radarMast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6), darkTrimMat);
  radarMast.position.y = -0.2;
  radarPivot.add(radarMast);
  towerGroup.add(radarPivot);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), beaconMat);
  beacon.position.set(0, 9.9, -1.0);
  towerGroup.add(beacon);

  const hangarGroup = new THREE.Group();
  hangarGroup.position.set(-10.0, -2.0, 6.0);
  const hangarBody = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.2, 7.5), concreteMat);
  hangarBody.position.y = 1.1;
  hangarGroup.add(hangarBody);
  const hangarRoof = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 7.5, 12, 1, false, 0, Math.PI),
    darkTrimMat
  );
  hangarRoof.rotation.z = Math.PI / 2;
  hangarRoof.rotation.y = Math.PI / 2;
  hangarRoof.position.y = 2.2;
  hangarGroup.add(hangarRoof);
  groundTerrainGroup.add(hangarGroup);
  groundTerrainGroup.add(towerGroup);

  // 5. Instanced Pine Forest (Multi-tier trunk + lower cone + upper cone)
  const treeCount = 320;
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1.2, 6);
  trunkGeo.translate(0, 0.6, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });

  const lowerConeGeo = new THREE.ConeGeometry(1.15, 2.6, 7);
  lowerConeGeo.translate(0, 2.1, 0);
  const upperConeGeo = new THREE.ConeGeometry(0.85, 2.2, 7);
  upperConeGeo.translate(0, 3.4, 0);
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.02,
    flatShading: true,
  });

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const lowerInst = new THREE.InstancedMesh(lowerConeGeo, foliageMat, treeCount);
  const upperInst = new THREE.InstancedMesh(upperConeGeo, foliageMat, treeCount);

  const dummy = new THREE.Object3D();
  const treePalette = [0x15803d, 0x166534, 0x14532d, 0x1e6b3b, 0x2d6a4f];

  let placedTrees = 0;
  let seed = 1337;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let attempt = 0; attempt < 900 && placedTrees < treeCount; attempt++) {
    const tx = (nextRand() - 0.5) * 380;
    const tz = (nextRand() - 0.5) * 380;

    if (Math.abs(tx) < 16 && Math.abs(tz) < 48) continue;

    const ty = getTerrainHeight(tx, tz);
    const relH = ty + 2.0;
    if (relH < 0.05 || relH > 8.2) continue;

    const scale = 0.75 + nextRand() * 0.65;
    dummy.position.set(tx, ty - 0.05, tz);
    dummy.rotation.set(0, nextRand() * Math.PI * 2, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();

    trunkInst.setMatrixAt(placedTrees, dummy.matrix);
    lowerInst.setMatrixAt(placedTrees, dummy.matrix);
    upperInst.setMatrixAt(placedTrees, dummy.matrix);

    colorTmp.setHex(treePalette[placedTrees % treePalette.length]);
    lowerInst.setColorAt(placedTrees, colorTmp);
    colorTmp.offsetHSL(0, 0, 0.04);
    upperInst.setColorAt(placedTrees, colorTmp);

    placedTrees++;
  }

  trunkInst.count = placedTrees;
  lowerInst.count = placedTrees;
  upperInst.count = placedTrees;
  trunkInst.instanceMatrix.needsUpdate = true;
  lowerInst.instanceMatrix.needsUpdate = true;
  upperInst.instanceMatrix.needsUpdate = true;
  if (lowerInst.instanceColor) lowerInst.instanceColor.needsUpdate = true;
  if (upperInst.instanceColor) upperInst.instanceColor.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  lowerInst.computeBoundingSphere();
  upperInst.computeBoundingSphere();
  trunkInst.frustumCulled = false;
  lowerInst.frustumCulled = false;
  upperInst.frustumCulled = false;

  groundTerrainGroup.add(trunkInst);
  groundTerrainGroup.add(lowerInst);
  groundTerrainGroup.add(upperInst);

  // 6. Instanced Alpine Rock Boulders on Slopes
  const rockCount = 90;
  const rockGeo = new THREE.DodecahedronGeometry(1.2, 0);
  rockGeo.translate(0, 0.6, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x78716c,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
  });
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);

  let placedRocks = 0;
  for (let i = 0; i < 300 && placedRocks < rockCount; i++) {
    const rx = (nextRand() - 0.5) * 390;
    const rz = (nextRand() - 0.5) * 390;
    if (Math.abs(rx) < 18 && Math.abs(rz) < 50) continue;
    const ry = getTerrainHeight(rx, rz);
    if (ry + 2.0 < 1.5) continue;

    dummy.position.set(rx, ry - 0.2, rz);
    dummy.rotation.set(nextRand() * 0.5, nextRand() * Math.PI, nextRand() * 0.5);
    dummy.scale.set(0.8 + nextRand() * 1.4, 0.6 + nextRand() * 1.1, 0.8 + nextRand() * 1.4);
    dummy.updateMatrix();
    rockInst.setMatrixAt(placedRocks, dummy.matrix);
    placedRocks++;
  }
  rockInst.count = placedRocks;
  rockInst.instanceMatrix.needsUpdate = true;
  rockInst.computeBoundingSphere();
  rockInst.frustumCulled = false;
  groundTerrainGroup.add(rockInst);

  // 7. High-Altitude 3D Cumulus Cloud Clusters (Always visible in both 'mountains' and 'clouds_only')
  const cloudCount = 42;
  const cloudGeo = new THREE.DodecahedronGeometry(2.2, 1);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.92,
    metalness: 0.0,
    flatShading: true,
  });
  const cloudInst = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
  for (let i = 0; i < cloudCount; i++) {
    const cx = (nextRand() - 0.5) * 400;
    const cz = (nextRand() - 0.5) * 400;
    const cy = 32 + nextRand() * 20;
    dummy.position.set(cx, cy, cz);
    dummy.rotation.set(0, nextRand() * Math.PI, 0);
    dummy.scale.set(1.6 + nextRand() * 1.4, 0.48 + nextRand() * 0.3, 1.2 + nextRand() * 1.1);
    dummy.updateMatrix();
    cloudInst.setMatrixAt(i, dummy.matrix);
  }
  cloudInst.instanceMatrix.needsUpdate = true;
  cloudInst.computeBoundingSphere();
  cloudInst.frustumCulled = false;
  worldGroup.add(cloudInst);

  // 7b. Multi-Layered Flight-Level Cloud Deck for 'clouds_only' Terrain Mode
  // Surrounds the aircraft with volumetric cloud formations that stream past the aircraft while it cruises at one point!
  const skyDeckCloudPuffs = 150;
  const skyCloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.0,
    flatShading: true,
  });
  const skyDeckInst = new THREE.InstancedMesh(cloudGeo, skyCloudMat, skyDeckCloudPuffs);
  interface CloudPuffTransform {
    baseX: number;
    baseY: number;
    baseZ: number;
    rotY: number;
    sx: number;
    sy: number;
    sz: number;
  }
  const skyPuffs: CloudPuffTransform[] = [];

  for (let c = 0; c < 70 && skyPuffs.length < skyDeckCloudPuffs; c++) {
    const baseCx = (nextRand() - 0.5) * 320;
    const baseCz = (nextRand() - 0.5) * 320;
    const baseCy = -10 + nextRand() * 34; // Spread across flight altitudes (-10m to +24m)
    // Keep immediate central lane (|x| < 16, |y - 8.5| < 7) clear so no cloud passes right through the camera lens
    if (Math.abs(baseCx) < 16 && Math.abs(baseCy - 8.5) < 7) continue;
    const rotY = nextRand() * Math.PI;

    // Each cloud cluster has 3 overlapping puffs (center, left, right) for rich cumulus silhouette
    for (let sub = 0; sub < 3 && skyPuffs.length < skyDeckCloudPuffs; sub++) {
      const offsetX = sub === 0 ? 0 : (sub === 1 ? -2.8 : 2.8) + (nextRand() - 0.5) * 1.2;
      const offsetY = sub === 0 ? 0.5 : -0.3 + (nextRand() - 0.5) * 0.4;
      const offsetZ = (nextRand() - 0.5) * 1.8;
      const sx = (sub === 0 ? 2.1 : 1.5) + nextRand() * 0.9;
      const sy = (sub === 0 ? 0.75 : 0.55) + nextRand() * 0.25;
      const sz = (sub === 0 ? 1.6 : 1.2) + nextRand() * 0.8;

      const puff: CloudPuffTransform = {
        baseX: baseCx + offsetX,
        baseY: baseCy + offsetY,
        baseZ: baseCz + offsetZ,
        rotY: rotY + sub * 0.5,
        sx,
        sy,
        sz,
      };
      dummy.position.set(puff.baseX, puff.baseY, puff.baseZ);
      dummy.rotation.set(0, puff.rotY, 0);
      dummy.scale.set(puff.sx, puff.sy, puff.sz);
      dummy.updateMatrix();
      skyDeckInst.setMatrixAt(skyPuffs.length, dummy.matrix);
      skyPuffs.push(puff);
    }
  }
  skyDeckInst.count = skyPuffs.length;
  skyDeckInst.instanceMatrix.needsUpdate = true;
  skyDeckInst.computeBoundingSphere();
  skyDeckInst.frustumCulled = false;
  cloudsOnlyGroup.add(skyDeckInst);
  cloudsOnlyGroup.visible = false;

  // 8. Interactive Flight Waypoint Rings along the Valley & Sky Passes
  const waypointMeshes: THREE.Mesh[] = [];
  const ringGeo = new THREE.TorusGeometry(4.0, 0.26, 10, 32);

  initialWaypoints.forEach((wp) => {
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.6,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(wp.x, wp.y, wp.z);
    worldGroup.add(ringMesh);
    waypointMeshes.push(ringMesh);
  });

  let cloudStreamOffsetZ = 0;

  // Update loop for animated world elements & terrain mode visibility
  const update = (
    delta: number,
    elapsedTime: number,
    waypoints: WaypointRing[],
    aircraftPos: THREE.Vector3,
    terrainMode: TerrainMode = 'mountains'
  ) => {
    worldGroup.visible = terrainMode !== 'off';
    groundTerrainGroup.visible = terrainMode === 'mountains';
    cloudsOnlyGroup.visible = terrainMode === 'clouds_only';

    // Rotate control tower radar when mountains mode is active
    if (terrainMode === 'mountains') {
      radarPivot.rotation.y += delta * 1.8;
    }

    // In 'clouds_only' mode, stream the 3D cloud deck past the stationary cruising aircraft!
    if (terrainMode === 'clouds_only') {
      cloudStreamOffsetZ = (cloudStreamOffsetZ + delta * 22.0) % 320;
      for (let i = 0; i < skyPuffs.length; i++) {
        const p = skyPuffs[i];
        let zPos = p.baseZ + cloudStreamOffsetZ;
        if (zPos > 160) zPos -= 320;
        if (zPos < -160) zPos += 320;
        dummy.position.set(aircraftPos.x + p.baseX, p.baseY, aircraftPos.z + zPos);
        dummy.rotation.set(0, p.rotY, 0);
        dummy.scale.set(p.sx, p.sy, p.sz);
        dummy.updateMatrix();
        skyDeckInst.setMatrixAt(i, dummy.matrix);
      }
      skyDeckInst.instanceMatrix.needsUpdate = true;
    }

    // Update waypoint ring visual state & gentle spin (only visible in 'mountains' mode)
    for (let i = 0; i < waypointMeshes.length; i++) {
      const mesh = waypointMeshes[i];
      const wp = waypoints[i];
      if (!mesh || !wp) continue;

      mesh.visible = terrainMode === 'mountains';
      if (!mesh.visible) continue;

      mesh.rotation.z = elapsedTime * 0.8 + i;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (wp.collected) {
        mat.color.setHex(0x10b981);
        mat.emissive.setHex(0x059669);
        mat.emissiveIntensity = 0.25;
      } else {
        mat.color.setHex(0xf59e0b);
        mat.emissive.setHex(0xd97706);
        mat.emissiveIntensity = 0.5;
      }
    }
  };

  return {
    group: worldGroup,
    waypointMeshes,
    update,
  };
}

