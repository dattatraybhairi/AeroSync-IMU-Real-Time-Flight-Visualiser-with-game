import * as THREE from 'three';

export type AircraftType =
  | 'airbus_a350'
  | 'boeing_787'
  | 'boeing_747'
  | 'airbus_a380'
  | 'fighter_jet'
  | 'stunt_plane';

export interface AircraftMetadata {
  id: AircraftType;
  name: string;
  manufacturer: 'Airbus' | 'Boeing' | 'AeroTest';
  code: string;
  wingspan: string;
  engines: string;
  description: string;
}

export const AIRCRAFT_CATALOG: AircraftMetadata[] = [
  {
    id: 'airbus_a350',
    name: 'Airbus A350-900 XWB',
    manufacturer: 'Airbus',
    code: 'A359',
    wingspan: '64.75 m',
    engines: '2× RR Trent XWB',
    description: 'Carbon-composite widebody with curved Sharklets & black mask cockpit',
  },
  {
    id: 'boeing_787',
    name: 'Boeing 787-9 Dreamliner',
    manufacturer: 'Boeing',
    code: 'B789',
    wingspan: '60.12 m',
    engines: '2× GEnx-1B Chevron',
    description: 'Swept raked-wingtip airliner with serrated chevron engine nacelles',
  },
  {
    id: 'boeing_747',
    name: 'Boeing 747-8 Intercontinental',
    manufacturer: 'Boeing',
    code: 'B748',
    wingspan: '68.40 m',
    engines: '4× GEnx-2B67',
    description: 'Iconic upper-deck hump quad-jet heavy commercial transport',
  },
  {
    id: 'airbus_a380',
    name: 'Airbus A380-800 Superjumbo',
    manufacturer: 'Airbus',
    code: 'A388',
    wingspan: '79.75 m',
    engines: '4× Trent 900',
    description: 'Full-length double-deck quad-engine flagship airliner',
  },
  {
    id: 'fighter_jet',
    name: 'F-22X Supersonic Testbed',
    manufacturer: 'AeroTest',
    code: 'F22X',
    wingspan: '13.56 m',
    engines: '2× F119 Turbofan',
    description: 'High-agility twin-tail supersonic flight test aircraft',
  },
  {
    id: 'stunt_plane',
    name: 'Extra 330SC Aerobatic',
    manufacturer: 'AeroTest',
    code: 'E330',
    wingspan: '8.00 m',
    engines: '1× Lycoming IO-580',
    description: 'Unlimited-category single-propeller aerobatic demonstrator',
  },
];

export interface AircraftInstance {
  group: THREE.Group;
  name: string;
  type: AircraftType;
  animate?: (delta: number, pitchDeg?: number, rollDeg?: number, yawDeg?: number) => void;
}

/**
 * High-Definition Fuselage Livery Texture Generator.
 * Creates:
 * 1. Cockpit Windshield & Glazing Mask (Airbus Black Mask or Boeing wrap) on the crown (X=512)
 * 2. Passenger Cabin Windows with chrome bezels, dark tinted glass, warm inner cabin glow, silhouettes
 * 3. Commercial Passenger Entry Doors (L1, L2, L4) with red emergency slide stripes and handles
 * 4. Longitudinal & circumferential panel lines, radome separation seam, pitot static sensors
 * 5. Belly composite fairing and airline cheatline striping
 */
function createSafeCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  return { width, height, getContext: () => null } as unknown as HTMLCanvasElement;
}

function createRealisticFuselageTexture(options: {
  stripeColor1: string;
  stripeColor2: string;
  airlineName?: string;
  cockpitType: 'a350_mask' | 'b787_wrap' | 'b747_hump' | 'a380_wide';
  doubleDeck?: boolean;
  forwardHump?: boolean;
}): THREE.CanvasTexture {
  const canvas = createSafeCanvas(1024, 2048);
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // 1. Base Aircraft White Coat (High-gloss aerospace polyurethane)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 1024, 2048);

  // 2. Subtle Circumferential & Longitudinal Aircraft Skin Panel Lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
  ctx.lineWidth = 1;

  for (let x = 64; x < 980; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 80);
    ctx.lineTo(x, 1950);
    ctx.stroke();
  }

  for (let y = 100; y < 1920; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }

  // 3. Belly Composite Fairing (U=0..96 and U=928..1024)
  const bellyGradL = ctx.createLinearGradient(0, 0, 96, 0);
  bellyGradL.addColorStop(0, '#cbd5e1');
  bellyGradL.addColorStop(1, '#f1f5f9');
  ctx.fillStyle = bellyGradL;
  ctx.fillRect(0, 0, 96, 2048);

  const bellyGradR = ctx.createLinearGradient(928, 0, 1024, 0);
  bellyGradR.addColorStop(0, '#f1f5f9');
  bellyGradR.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = bellyGradR;
  ctx.fillRect(928, 0, 96, 2048);

  // 4. Radome Nose Cone Separation Seam (Y ~ 90)
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 90);
  ctx.lineTo(1024, 90);
  ctx.stroke();

  // 5. COCKPIT WINDSHIELD (Clean, simple, realistic glazing panes without wipers or extra clutter)
  const cx = 512;
  const cy = 250;

  if (options.cockpitType === 'a350_mask') {
    // Airbus A350 Signature Black Mask Frame
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.moveTo(cx - 120, cy + 45);
    ctx.quadraticCurveTo(cx - 110, cy - 10, cx - 60, cy - 35);
    ctx.quadraticCurveTo(cx, cy - 42, cx + 60, cy - 35);
    ctx.quadraticCurveTo(cx + 110, cy - 10, cx + 120, cy + 45);
    ctx.quadraticCurveTo(cx + 60, cy + 35, cx, cy + 32);
    ctx.quadraticCurveTo(cx - 60, cy + 35, cx - 120, cy + 45);
    ctx.closePath();
    ctx.fill();

    // 6 Distinct Cockpit Windshield Panes
    const drawA350Pane = (x: number, y: number, w: number, h: number, skew: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.transform(1, 0, skew, 1, 0, 0);

      // Chrome Frame
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.roundRect(-2, -2, w + 4, h + 4, 4);
      ctx.fill();

      // Deep obsidian glass
      const glassGrad = ctx.createLinearGradient(0, 0, 0, h);
      glassGrad.addColorStop(0, '#020617');
      glassGrad.addColorStop(0.5, '#0b1329');
      glassGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = glassGrad;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 3);
      ctx.fill();

      // Reflection Sheen
      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.beginPath();
      ctx.moveTo(2, 2);
      ctx.lineTo(w * 0.45, 2);
      ctx.lineTo(w * 0.25, h - 2);
      ctx.lineTo(2, h - 2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    // Center Windshield Panes (Captain & FO)
    drawA350Pane(cx - 48, cy - 25, 42, 48, 0.08); // Captain Forward
    drawA350Pane(cx + 6, cy - 25, 42, 48, -0.08); // FO Forward

    // Side Direct Vision Windows
    drawA350Pane(cx - 96, cy - 16, 40, 42, 0.22); // Captain Side
    drawA350Pane(cx + 56, cy - 16, 40, 42, -0.22); // FO Side

    // Quarter Windows
    drawA350Pane(cx - 128, cy - 5, 26, 36, 0.35); // Captain Quarter
    drawA350Pane(cx + 102, cy - 5, 26, 36, -0.35); // FO Quarter

    // Center Windshield Divider Post
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 3, cy - 27, 6, 52);
  } else if (options.cockpitType === 'b787_wrap') {
    // Boeing 787 4-Pane Streamlined Wrap-Around Windshield
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(cx - 110, cy - 28, 220, 56, 12);
    ctx.fill();

    const draw787Pane = (x: number, y: number, w: number, h: number, skew: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.transform(1, 0, skew, 1, 0, 0);

      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.roundRect(-2, -2, w + 4, h + 4, 6);
      ctx.fill();

      const glassGrad = ctx.createLinearGradient(0, 0, 0, h);
      glassGrad.addColorStop(0, '#030712');
      glassGrad.addColorStop(0.6, '#0f172a');
      glassGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = glassGrad;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 4);
      ctx.fill();

      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.beginPath();
      ctx.moveTo(2, 2);
      ctx.lineTo(w * 0.4, 2);
      ctx.lineTo(w * 0.2, h - 2);
      ctx.lineTo(2, h - 2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    draw787Pane(cx - 50, cy - 22, 46, 44, 0.08);
    draw787Pane(cx + 4, cy - 22, 46, 44, -0.08);
    draw787Pane(cx - 104, cy - 14, 46, 38, 0.25);
    draw787Pane(cx + 58, cy - 14, 46, 38, -0.25);

    // Center divider
    ctx.fillStyle = '#64748b';
    ctx.fillRect(cx - 2, cy - 24, 4, 48);
  } else if (options.cockpitType === 'b747_hump') {
    // Boeing 747 Upper-Deck Flight Deck Glazing
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(cx - 90, cy - 24, 180, 50, 8);
    ctx.fill();

    [-38, 4].forEach((xOff) => {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(cx + xOff - 1, cy - 18, 36, 38);
      ctx.fillStyle = '#090d16';
      ctx.fillRect(cx + xOff + 1, cy - 16, 32, 34);
    });

    [-82, 48].forEach((xOff) => {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(cx + xOff - 1, cy - 12, 34, 30);
      ctx.fillStyle = '#090d16';
      ctx.fillRect(cx + xOff + 1, cy - 10, 30, 26);
    });
  } else {
    // Airbus A380 Wide Double-Deck Cockpit
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.roundRect(cx - 105, cy - 25, 210, 52, 10);
    ctx.fill();

    [-46, 4].forEach((xOff) => {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(cx + xOff - 1, cy - 19, 44, 40);
      ctx.fillStyle = '#020617';
      ctx.fillRect(cx + xOff + 1, cy - 17, 40, 36);
    });

    [-98, 56].forEach((xOff) => {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(cx + xOff - 1, cy - 13, 42, 32);
      ctx.fillStyle = '#020617';
      ctx.fillRect(cx + xOff + 1, cy - 11, 38, 28);
    });
  }

  // 6. Draw Port and Starboard sides (Doors, Windows, Cheatlines)
  const drawSide = (sideX: number, dirTowardCrown: number, isPort: boolean) => {
    // A. Main Airline Cheatlines
    const cheatGrad = ctx.createLinearGradient(
      sideX - dirTowardCrown * 48,
      0,
      sideX - dirTowardCrown * 12,
      0
    );
    cheatGrad.addColorStop(0, options.stripeColor2);
    cheatGrad.addColorStop(0.6, options.stripeColor1);
    cheatGrad.addColorStop(1, '#38bdf8');
    ctx.fillStyle = cheatGrad;
    ctx.fillRect(sideX - dirTowardCrown * 42, 320, 16, 1580);

    ctx.fillStyle = options.stripeColor2;
    ctx.fillRect(sideX - dirTowardCrown * 56, 340, 6, 1560);

    // B. Airline Logotype on Forward Fuselage
    if (options.airlineName) {
      ctx.save();
      ctx.translate(sideX + dirTowardCrown * 45, 540);
      ctx.rotate(dirTowardCrown * (Math.PI / 2));
      ctx.fillStyle = options.stripeColor2;
      ctx.font = 'bold 28px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.letterSpacing = '3px';
      ctx.fillText(options.airlineName, 0, 0);
      ctx.restore();
    }

    // Realistic Passenger Entry Doors (L1, L2, L4)
    const drawDoor = (y: number, label: string) => {
      const doorW = 28;
      const doorH = 68;
      const doorX = sideX - 6;

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.strokeRect(doorX, y, doorW, doorH);

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(doorX + 7, y + 14, 14, 20, 4);
      ctx.fill();

      // Red emergency slide indicator
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(doorX + 2, y + 36, 4, 12);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(doorX + 8, y + 40, 12, 3);

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(label, doorX + 4, y + doorH + 11);
    };

    drawDoor(390, isPort ? 'L1' : 'R1');
    drawDoor(680, isPort ? 'L2' : 'R2');
    drawDoor(1520, isPort ? 'L4' : 'R4');

    // Over-Wing Emergency Escape Markings
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(sideX - 10, 960, 36, 120);
    ctx.setLineDash([]);

    // Realistic Cabin Windows
    const renderWindowRow = (offsetY: number, startY: number, endY: number) => {
      for (let y = startY; y < endY; y += 34) {
        if (
          (y > 380 && y < 470) ||
          (y > 670 && y < 760) ||
          (y > 970 && y < 1070) ||
          (y > 1510 && y < 1600)
        ) {
          continue;
        }

        const winX = sideX + offsetY;
        const winW = 18;
        const winH = 26;

        // Chrome outer frame
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.roundRect(winX - 2, y - 2, winW + 4, winH + 4, 6);
        ctx.fill();

        // Inner shadow
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.roundRect(winX - 1, y - 1, winW + 2, winH + 2, 5);
        ctx.fill();

        // Deep tinted glass
        const glassGrad = ctx.createLinearGradient(winX, y, winX, y + winH);
        glassGrad.addColorStop(0, '#090d16');
        glassGrad.addColorStop(0.55, '#0f172a');
        glassGrad.addColorStop(0.9, '#1e293b');
        ctx.fillStyle = glassGrad;
        ctx.beginPath();
        ctx.roundRect(winX, y, winW, winH, 4);
        ctx.fill();

        // Warm interior passenger cabin glow
        ctx.fillStyle = 'rgba(254, 240, 138, 0.45)';
        ctx.beginPath();
        ctx.ellipse(winX + winW / 2, y + winH * 0.65, 5, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Passenger silhouette
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.beginPath();
        ctx.ellipse(winX + winW / 2, y + winH * 0.55, 3.5, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Reflection sheen streak
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.moveTo(winX + 2, y + 2);
        ctx.lineTo(winX + 8, y + 2);
        ctx.lineTo(winX + 4, y + winH - 2);
        ctx.lineTo(winX + 2, y + winH - 2);
        ctx.closePath();
        ctx.fill();
      }
    };

    renderWindowRow(0, 360, 1750);

    if (options.doubleDeck) {
      renderWindowRow(dirTowardCrown * 44, 400, 1700);
    } else if (options.forwardHump) {
      renderWindowRow(dirTowardCrown * 42, 420, 920);
    }
  };

  drawSide(256, 1, false); // Starboard (+X)
  drawSide(768, -1, true); // Port (-X)

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Creates a continuous aerodynamic fuselage lathe mesh with distance-based UV mapping.
 * Eliminates all seams between nose, cabin, and tail!
 */
function createContinuousFuselage(
  profile: THREE.Vector2[],
  texture: THREE.CanvasTexture
): THREE.Mesh {
  const geo = new THREE.LatheGeometry(profile, 40);

  // Compute arc-length based UVs to eliminate texture distortion
  const distances: number[] = [0];
  for (let i = 1; i < profile.length; i++) {
    distances.push(distances[i - 1] + profile[i].distanceTo(profile[i - 1]));
  }
  const totalDist = distances[distances.length - 1];
  const uvs = geo.attributes.uv;
  const numSegments = uvs.count / profile.length;
  for (let s = 0; s < numSegments; s++) {
    for (let j = 0; j < profile.length; j++) {
      const idx = s * profile.length + j;
      uvs.setY(idx, 1.0 - distances[j] / totalDist);
    }
  }
  uvs.needsUpdate = true;

  // Rotate lathe so cylinder axis aligns with Z (Forward = -Z, Aft = +Z, Crown = +Y)
  geo.rotateX(Math.PI / 2);

  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.22,
    metalness: 0.18,
  });

  return new THREE.Mesh(geo, mat);
}


/**
 * Creates an ultra-realistic Vertical Stabilizer (Fin) & Articulated Rudder.
 * Kinematically hinges strictly along the swept trailing-edge hinge line!
 * Leading edge of rudder is 100% pinned to the fin trailing edge with zero gap for all yaw angles.
 */
function createVerticalTailAndRudder(options: {
  finColor: THREE.Material;
  rudderColor?: THREE.Material;
  rootY: number;
  tipY: number;
  finDorsalZ: number;
  finLeadingRootZ: number;
  finTipLeadingZ: number;
  finTipHingeZ: number;
  finRootHingeZ: number;
  rudderRootChord: number;
  rudderTipChord: number;
  thickness?: number;
}): {
  group: THREE.Group;
  setYaw: (yawRad: number) => void;
} {
  const group = new THREE.Group();
  const thickness = options.thickness || 0.048;

  // 1. Fixed Fin in (Z, Y)
  const finShape = new THREE.Shape();
  finShape.moveTo(options.finDorsalZ, options.rootY + 0.05);
  finShape.quadraticCurveTo(
    (options.finDorsalZ + options.finLeadingRootZ) * 0.5,
    options.rootY + 0.16,
    options.finLeadingRootZ,
    options.rootY + 0.36
  );
  finShape.lineTo(options.finTipLeadingZ, options.tipY);
  finShape.lineTo(options.finTipHingeZ, options.tipY); // Hinge line tip
  finShape.lineTo(options.finRootHingeZ, options.rootY); // Hinge line root
  finShape.closePath();

  const finGeo = new THREE.ExtrudeGeometry(finShape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.005,
    bevelThickness: 0.005,
  });
  finGeo.rotateY(-Math.PI / 2);
  finGeo.translate(thickness / 2, 0, 0);

  const finMesh = new THREE.Mesh(finGeo, options.finColor);
  group.add(finMesh);

  // 2. Articulated Rudder Kinematics along the Swept Hinge Line
  const dy = options.tipY - options.rootY;
  const dz = options.finTipHingeZ - options.finRootHingeZ;
  const hingeLength = Math.hypot(dy, dz);
  const tiltAngle = Math.atan2(dz, dy);

  const rudderHingeGroup = new THREE.Group();
  rudderHingeGroup.position.set(0, options.rootY, options.finRootHingeZ);
  rudderHingeGroup.rotation.x = tiltAngle;

  const rudderShape = new THREE.Shape();
  rudderShape.moveTo(0, 0);
  rudderShape.lineTo(options.rudderRootChord, 0);
  rudderShape.lineTo(options.rudderTipChord, hingeLength);
  rudderShape.lineTo(0, hingeLength);
  rudderShape.closePath();

  const rudderGeo = new THREE.ExtrudeGeometry(rudderShape, {
    depth: thickness * 0.9,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.004,
    bevelThickness: 0.004,
  });
  rudderGeo.rotateY(-Math.PI / 2);
  rudderGeo.translate((thickness * 0.9) / 2, 0, 0);

  const rudderMesh = new THREE.Mesh(rudderGeo, options.rudderColor || options.finColor);
  rudderHingeGroup.add(rudderMesh);
  group.add(rudderHingeGroup);

  return {
    group,
    setYaw: (yawRad: number) => {
      rudderMesh.rotation.y = yawRad;
    },
  };
}

/**
 * Creates aerodynamic Horizontal Stabilizers & Articulated Elevators
 */
function createHorizontalTailAndElevators(options: {
  span: number;
  rootChord: number;
  tipChord: number;
  sweepZ: number;
  yPos: number;
  rootZ: number;
  stabColor: THREE.Material;
  elevatorColor?: THREE.Material;
}): {
  group: THREE.Group;
  setPitch: (pitchRad: number) => void;
} {
  const group = new THREE.Group();
  const elevColor = options.elevatorColor || options.stabColor;

  const rightElevGroup = new THREE.Group();
  const leftElevGroup = new THREE.Group();

  // Fixed Stabilizer Shape
  const hStabShape = new THREE.Shape();
  hStabShape.moveTo(0, 0);
  hStabShape.lineTo(options.span, options.sweepZ * 0.7);
  hStabShape.lineTo(options.span, options.sweepZ * 0.7 + options.tipChord * 0.75);
  hStabShape.lineTo(0, options.rootChord * 0.75);
  hStabShape.closePath();

  const hStabGeo = new THREE.ExtrudeGeometry(hStabShape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.006,
    bevelThickness: 0.006,
  });
  hStabGeo.rotateX(Math.PI / 2);

  const rightStab = new THREE.Mesh(hStabGeo, options.stabColor);
  rightStab.position.set(0.12, options.yPos, options.rootZ);
  group.add(rightStab);

  const leftStab = rightStab.clone();
  leftStab.scale.set(-1, 1, 1);
  leftStab.position.set(-0.12, options.yPos, options.rootZ);
  group.add(leftStab);

  // Articulated Elevators
  const elevGeo = new THREE.BoxGeometry(options.span * 0.88, 0.022, options.tipChord * 0.35);

  const rightElevMesh = new THREE.Mesh(elevGeo, elevColor);
  rightElevMesh.position.set(options.span * 0.52, options.yPos, options.rootZ + options.sweepZ * 0.8 + options.tipChord * 0.75);
  rightElevMesh.rotation.y = -Math.atan2(options.sweepZ * 0.3, options.span);
  rightElevGroup.add(rightElevMesh);

  const leftElevMesh = new THREE.Mesh(elevGeo, elevColor);
  leftElevMesh.position.set(-options.span * 0.52, options.yPos, options.rootZ + options.sweepZ * 0.8 + options.tipChord * 0.75);
  leftElevMesh.rotation.y = Math.atan2(options.sweepZ * 0.3, options.span);
  leftElevGroup.add(leftElevMesh);

  group.add(rightElevGroup);
  group.add(leftElevGroup);

  return {
    group,
    setPitch: (pitchRad: number) => {
      rightElevMesh.rotation.x = pitchRad;
      leftElevMesh.rotation.x = pitchRad;
    },
  };
}

/**
 * Creates High-Bypass Turbofan Engine with spinning swirl cone and 20 titanium fan blades.
 */
function createRealisticTurbofan(options: {
  radius: number;
  length: number;
  cowlColor: number;
  chevron?: boolean;
}): { nacelleGroup: THREE.Group; fanSpinner: THREE.Group } {
  const nacelleGroup = new THREE.Group();

  const cowlMat = new THREE.MeshStandardMaterial({
    color: options.cowlColor,
    roughness: 0.2,
    metalness: 0.25,
  });

  const polishedChromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.12,
    metalness: 0.92,
  });

  const titaniumFanMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.18,
    metalness: 0.88,
  });

  const exhaustCoreMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.35,
    metalness: 0.8,
  });

  const darkAcousticLinerMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.65,
    metalness: 0.3,
  });

  const r = options.radius;
  const len = options.length;

  // 1. Aerodynamic Nacelle Cowling Outer Shell
  const cowlPts = [
    new THREE.Vector2(r * 0.82, -len * 0.5),
    new THREE.Vector2(r * 0.98, -len * 0.44),
    new THREE.Vector2(r * 1.03, -len * 0.12),
    new THREE.Vector2(r * 0.99, len * 0.26),
    new THREE.Vector2(r * 0.84, len * 0.5),
    new THREE.Vector2(r * 0.76, len * 0.5),
    new THREE.Vector2(r * 0.74, -len * 0.44),
  ];
  const cowlGeo = new THREE.LatheGeometry(cowlPts, 32);
  cowlGeo.rotateX(Math.PI / 2);
  const cowlMesh = new THREE.Mesh(cowlGeo, cowlMat);
  nacelleGroup.add(cowlMesh);

  // 2. Polished Titanium Intake Lip Ring (-Z forward)
  const lipGeo = new THREE.TorusGeometry(r * 0.87, r * 0.08, 14, 32);
  const lipMesh = new THREE.Mesh(lipGeo, polishedChromeMat);
  lipMesh.position.z = -len * 0.485;
  nacelleGroup.add(lipMesh);

  // 3. Acoustic Barrel Liner ring inside the inlet
  const linerGeo = new THREE.CylinderGeometry(r * 0.81, r * 0.81, len * 0.38, 28, 1, true);
  linerGeo.rotateX(Math.PI / 2);
  const linerMesh = new THREE.Mesh(linerGeo, darkAcousticLinerMat);
  linerMesh.position.z = -len * 0.26;
  nacelleGroup.add(linerMesh);

  // 4. Stator Guide Vanes inside the bypass duct
  const statorCount = 16;
  const statorGeo = new THREE.BoxGeometry(r * 0.04, r * 0.68, 0.02);
  for (let i = 0; i < statorCount; i++) {
    const angle = (i / statorCount) * Math.PI * 2;
    const stator = new THREE.Mesh(statorGeo, titaniumFanMat);
    stator.position.set(Math.cos(angle) * r * 0.42, Math.sin(angle) * r * 0.42, -len * 0.08);
    stator.rotation.z = angle;
    stator.rotation.x = -0.35;
    nacelleGroup.add(stator);
  }

  // 5. Rear Primary Exhaust Core Cone (+Z aft)
  const coreGeo = new THREE.ConeGeometry(r * 0.46, len * 0.52, 24);
  coreGeo.rotateX(Math.PI / 2);
  const coreMesh = new THREE.Mesh(coreGeo, exhaustCoreMat);
  coreMesh.position.z = len * 0.54;
  nacelleGroup.add(coreMesh);

  // Optional Boeing Serrated Chevrons on Trailing Edge
  if (options.chevron) {
    const chevCount = 12;
    for (let i = 0; i < chevCount; i++) {
      const ang = (i / chevCount) * Math.PI * 2;
      const chevGeo = new THREE.ConeGeometry(r * 0.075, len * 0.16, 3);
      chevGeo.rotateX(Math.PI / 2);
      const chev = new THREE.Mesh(chevGeo, cowlMat);
      chev.position.set(
        Math.cos(ang) * r * 0.78,
        Math.sin(ang) * r * 0.78,
        len * 0.55
      );
      chev.rotation.z = ang;
      nacelleGroup.add(chev);
    }
  }

  // 6. Spinning Fan Assembly
  const fanSpinner = new THREE.Group();
  fanSpinner.position.z = -len * 0.32;

  // Painted Swirl Spinner Cone (GE / Rolls-Royce Spiral)
  const spinnerCanvas = createSafeCanvas(256, 256);
  const sCtx = spinnerCanvas.getContext('2d');
  if (sCtx) {
    sCtx.fillStyle = '#0f172a';
    sCtx.fillRect(0, 0, 256, 256);

    sCtx.strokeStyle = '#ffffff';
    sCtx.lineWidth = 14;
    sCtx.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.1) {
      const rad = a * 7.5;
      const x = 128 + Math.cos(a) * rad;
      const y = 128 + Math.sin(a) * rad;
      if (a === 0) sCtx.moveTo(x, y);
      else sCtx.lineTo(x, y);
    }
    sCtx.stroke();
  }

  const spinnerTex = new THREE.CanvasTexture(spinnerCanvas);
  spinnerTex.colorSpace = THREE.SRGBColorSpace;

  const spinnerMat = new THREE.MeshStandardMaterial({
    map: spinnerTex,
    roughness: 0.2,
    metalness: 0.6,
  });

  const spinnerConeGeo = new THREE.ConeGeometry(r * 0.26, r * 0.52, 24);
  spinnerConeGeo.rotateX(-Math.PI / 2);
  const spinnerMesh = new THREE.Mesh(spinnerConeGeo, spinnerMat);
  spinnerMesh.position.z = -r * 0.16;
  fanSpinner.add(spinnerMesh);

  // 20 Wide-Chord Scimitar Swept Titanium Fan Blades
  const numBlades = 20;
  for (let i = 0; i < numBlades; i++) {
    const angle = (i / numBlades) * Math.PI * 2;

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0);
    bladeShape.quadraticCurveTo(r * 0.08, r * 0.35, r * 0.12, r * 0.72);
    bladeShape.lineTo(r * 0.04, r * 0.72);
    bladeShape.quadraticCurveTo(0, r * 0.35, -r * 0.04, 0);
    bladeShape.closePath();

    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.018,
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: 0.005,
      bevelThickness: 0.005,
    });

    const bladeMesh = new THREE.Mesh(bladeGeo, titaniumFanMat);
    bladeMesh.rotation.z = angle;
    bladeMesh.rotation.x = 0.45;
    bladeMesh.position.set(Math.cos(angle) * r * 0.14, Math.sin(angle) * r * 0.14, 0);
    fanSpinner.add(bladeMesh);
  }

  nacelleGroup.add(fanSpinner);

  return { nacelleGroup, fanSpinner };
}

/**
 * Creates Canoe Flap Track Fairings underneath wings
 */
function createFlapTrackCanoes(positions: { x: number; y: number; z: number; scale?: number }[]): THREE.Group {
  const canoesGroup = new THREE.Group();
  const fairingMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.25,
    metalness: 0.2,
  });

  positions.forEach((pos) => {
    const s = pos.scale || 1.0;
    const canoeGeo = new THREE.CapsuleGeometry(0.045 * s, 0.42 * s, 10, 16);
    canoeGeo.rotateX(Math.PI / 2);
    const canoe = new THREE.Mesh(canoeGeo, fairingMat);
    canoe.position.set(pos.x, pos.y, pos.z);
    canoe.scale.set(0.9, 1.25, 1.0);
    canoesGroup.add(canoe);
  });

  return canoesGroup;
}

/**
 * 1. AIRBUS A350-900 XWB
 */
export function createAirbusA350(): AircraftInstance {
  const group = new THREE.Group();
  group.name = 'AirbusA350';

  const fuselageTex = createRealisticFuselageTexture({
    stripeColor1: '#0284c7',
    stripeColor2: '#0f172a',
    airlineName: 'AIRBUS A350',
    cockpitType: 'a350_mask',
  });

  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.25,
    metalness: 0.2,
  });

  const slatMetalMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.15,
    metalness: 0.85,
  });

  const airbusBlueMat = new THREE.MeshStandardMaterial({
    color: 0x0369a1,
    roughness: 0.24,
    metalness: 0.25,
  });

  // 1. Continuous Seamless Aerodynamic Fuselage (Nose to APU Tail)
  const a350Profile = [
    new THREE.Vector2(0.001, -3.55), // Radome tip
    new THREE.Vector2(0.16, -3.25),  // Radome cone seam
    new THREE.Vector2(0.32, -2.85),  // Cockpit window slope
    new THREE.Vector2(0.42, -2.50),  // Cockpit brow
    new THREE.Vector2(0.455, -2.15), // Forward door L1 area
    new THREE.Vector2(0.46, -1.60),  // Constant cabin cross-section
    new THREE.Vector2(0.46, 1.80),   // Constant cabin ends
    new THREE.Vector2(0.44, 2.30),   // Aft taper starts
    new THREE.Vector2(0.36, 2.95),   // Horizontal tail root
    new THREE.Vector2(0.24, 3.55),   // Tail cone
    new THREE.Vector2(0.12, 3.95),   // APU exhaust section
    new THREE.Vector2(0.04, 4.15),   // APU outlet
  ];
  const fuselageMesh = createContinuousFuselage(a350Profile, fuselageTex);
  group.add(fuselageMesh);

  // 4. APU Metal Exhaust Nozzle
  const apuGeo = new THREE.CylinderGeometry(0.038, 0.044, 0.12, 16);
  apuGeo.rotateX(Math.PI / 2);
  const apuMesh = new THREE.Mesh(
    apuGeo,
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.3 })
  );
  apuMesh.position.set(0, 0.02, 4.18);
  group.add(apuMesh);

  // 5. Cambered Swept Wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -0.75);
  wingShape.lineTo(3.45, 0.95);
  wingShape.lineTo(3.45, 1.25);
  wingShape.lineTo(1.2, 0.65);
  wingShape.lineTo(0, 0.65);
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.016,
    bevelThickness: 0.016,
  });
  wingGeo.rotateX(Math.PI / 2);

  const rightWing = new THREE.Mesh(wingGeo, wingMat);
  rightWing.position.set(0.36, -0.14, -0.15);
  rightWing.rotation.z = 0.055;
  group.add(rightWing);

  const leftWing = rightWing.clone();
  leftWing.scale.set(-1, 1, 1);
  leftWing.position.set(-0.36, -0.14, -0.15);
  leftWing.rotation.z = -0.055;
  group.add(leftWing);

  // Slats
  const slatGeo = new THREE.BoxGeometry(3.3, 0.04, 0.06);
  const rightSlat = new THREE.Mesh(slatGeo, slatMetalMat);
  rightSlat.position.set(2.0, -0.05, 0.05);
  rightSlat.rotation.y = -0.46;
  group.add(rightSlat);

  const leftSlat = rightSlat.clone();
  leftSlat.position.set(-2.0, -0.05, 0.05);
  leftSlat.rotation.y = 0.46;
  group.add(leftSlat);

  // Flap Track Canoes
  const canoePositions = [
    { x: 1.15, y: -0.22, z: 0.38, scale: 1.05 },
    { x: 1.85, y: -0.18, z: 0.58, scale: 0.95 },
    { x: 2.55, y: -0.14, z: 0.78, scale: 0.85 },
  ];
  group.add(createFlapTrackCanoes(canoePositions));
  group.add(createFlapTrackCanoes(canoePositions.map((c) => ({ ...c, x: -c.x }))));

  // Curved Sharklets
  const sharkletShape = new THREE.Shape();
  sharkletShape.moveTo(0, 0);
  sharkletShape.quadraticCurveTo(0.14, 0.28, 0.35, 0.55);
  sharkletShape.lineTo(0.5, 0.55);
  sharkletShape.lineTo(0.32, 0);
  sharkletShape.closePath();

  const sharkletGeo = new THREE.ExtrudeGeometry(sharkletShape, { depth: 0.025, bevelEnabled: false });
  sharkletGeo.rotateY(-Math.PI / 2);

  const rightSharklet = new THREE.Mesh(sharkletGeo, airbusBlueMat);
  rightSharklet.position.set(3.8, 0.04, 0.8);
  rightSharklet.rotation.z = -0.12;
  group.add(rightSharklet);

  const leftSharklet = rightSharklet.clone();
  leftSharklet.position.set(-3.8, 0.04, 0.8);
  leftSharklet.rotation.z = 0.12;
  group.add(leftSharklet);

  // Nav lights
  const navLightMatGreen = new THREE.MeshBasicMaterial({ color: 0x22c55e });
  const navLightMatRed = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const navGeo = new THREE.SphereGeometry(0.03, 10, 10);

  const starNav = new THREE.Mesh(navGeo, navLightMatGreen);
  starNav.position.set(3.82, 0.05, 0.82);
  group.add(starNav);

  const portNav = new THREE.Mesh(navGeo, navLightMatRed);
  portNav.position.set(-3.82, 0.05, 0.82);
  group.add(portNav);

  // Articulated Inboard Flaps & Ailerons
  const flapMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35 });
  const aileronGeo = new THREE.BoxGeometry(0.95, 0.025, 0.14);
  const rightAileron = new THREE.Mesh(aileronGeo, flapMat);
  rightAileron.position.set(2.65, -0.04, 0.72);
  rightAileron.rotation.y = -0.42;
  group.add(rightAileron);

  const leftAileron = rightAileron.clone();
  leftAileron.position.set(-2.65, -0.04, 0.72);
  leftAileron.rotation.y = 0.42;
  group.add(leftAileron);

  // Twin Rolls-Royce Trent XWB Turbofans
  const spinners: THREE.Group[] = [];
  const engR = createRealisticTurbofan({
    radius: 0.28,
    length: 1.1,
    cowlColor: 0xf8fafc,
    chevron: false,
  });
  engR.nacelleGroup.position.set(1.4, -0.38, -0.32);
  group.add(engR.nacelleGroup);
  spinners.push(engR.fanSpinner);

  const engL = createRealisticTurbofan({
    radius: 0.28,
    length: 1.1,
    cowlColor: 0xf8fafc,
    chevron: false,
  });
  engL.nacelleGroup.position.set(-1.4, -0.38, -0.32);
  group.add(engL.nacelleGroup);
  spinners.push(engL.fanSpinner);

  const pylonGeo = new THREE.BoxGeometry(0.065, 0.26, 0.7);
  const pylonR = new THREE.Mesh(pylonGeo, wingMat);
  pylonR.position.set(1.4, -0.19, -0.22);
  group.add(pylonR);

  const pylonL = pylonR.clone();
  pylonL.position.set(-1.4, -0.19, -0.22);
  group.add(pylonL);

  // 6. Articulated Vertical Tail & Kinematic Rudder
  const tailAssembly = createVerticalTailAndRudder({
    finColor: airbusBlueMat,
    rudderColor: airbusBlueMat,
    rootY: 0.38,
    tipY: 2.05,
    finDorsalZ: 1.35,
    finLeadingRootZ: 1.85,
    finTipLeadingZ: 2.92,
    finTipHingeZ: 3.32,
    finRootHingeZ: 3.00,
    rudderRootChord: 0.36,
    rudderTipChord: 0.22,
    thickness: 0.05,
  });
  group.add(tailAssembly.group);

  // 7. Horizontal Stabilizer & Elevators
  const hTailAssembly = createHorizontalTailAndElevators({
    span: 1.35,
    rootChord: 0.52,
    tipChord: 0.32,
    sweepZ: 0.38,
    yPos: 0.1,
    rootZ: 2.75,
    stabColor: wingMat,
    elevatorColor: flapMat,
  });
  group.add(hTailAssembly.group);

  const animate = (delta: number, pitchDeg = 0, rollDeg = 0, yawDeg = 0) => {
    spinners.forEach((s) => {
      s.rotation.z += delta * 24.0;
    });

    const rollDeflect = THREE.MathUtils.clamp(rollDeg * 0.009, -0.4, 0.4);
    rightAileron.rotation.x = rollDeflect;
    leftAileron.rotation.x = -rollDeflect;

    const pitchDeflect = THREE.MathUtils.clamp(pitchDeg * 0.01, -0.38, 0.38);
    hTailAssembly.setPitch(pitchDeflect);

    const yawDeflect = THREE.MathUtils.clamp(yawDeg * 0.008, -0.35, 0.35);
    tailAssembly.setYaw(yawDeflect);
  };

  return { group, name: 'Airbus A350-900 XWB', type: 'airbus_a350', animate };
}

/**
 * 2. BOEING 787-9 DREAMLINER
 */
export function createBoeing787(): AircraftInstance {
  const group = new THREE.Group();
  group.name = 'Boeing787';

  const liveryTex = createRealisticFuselageTexture({
    stripeColor1: '#1d4ed8',
    stripeColor2: '#0284c7',
    airlineName: 'BOEING 787',
    cockpitType: 'b787_wrap',
  });

  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.24,
    metalness: 0.2,
  });

  const slatMetalMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.15,
    metalness: 0.85,
  });

  const boeingBlueMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    roughness: 0.25,
    metalness: 0.28,
  });

  // 1. Continuous Seamless Fuselage
  const b787Profile = [
    new THREE.Vector2(0.001, -3.52),
    new THREE.Vector2(0.15, -3.22),
    new THREE.Vector2(0.31, -2.82),
    new THREE.Vector2(0.41, -2.48),
    new THREE.Vector2(0.445, -2.12),
    new THREE.Vector2(0.45, -1.55),
    new THREE.Vector2(0.45, 1.75),
    new THREE.Vector2(0.43, 2.25),
    new THREE.Vector2(0.35, 2.88),
    new THREE.Vector2(0.23, 3.48),
    new THREE.Vector2(0.11, 3.88),
    new THREE.Vector2(0.038, 4.08),
  ];
  const fuselageMesh = createContinuousFuselage(b787Profile, liveryTex);
  group.add(fuselageMesh);

  // 3. Swept Dihedral Wings with Raked Wingtips
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -0.7);
  wingShape.lineTo(3.1, 0.85);
  wingShape.lineTo(3.75, 1.45);
  wingShape.lineTo(3.65, 1.58);
  wingShape.lineTo(2.9, 1.15);
  wingShape.lineTo(0, 0.6);
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.055,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.015,
    bevelThickness: 0.015,
  });
  wingGeo.rotateX(Math.PI / 2);

  const rightWing = new THREE.Mesh(wingGeo, whiteMat);
  rightWing.position.set(0.35, -0.12, -0.15);
  rightWing.rotation.z = 0.085;
  group.add(rightWing);

  const leftWing = rightWing.clone();
  leftWing.scale.set(-1, 1, 1);
  leftWing.position.set(-0.35, -0.12, -0.15);
  leftWing.rotation.z = -0.085;
  group.add(leftWing);

  const canoePositions = [
    { x: 1.15, y: -0.21, z: 0.35, scale: 1.0 },
    { x: 1.82, y: -0.16, z: 0.54, scale: 0.9 },
    { x: 2.52, y: -0.11, z: 0.74, scale: 0.8 },
  ];
  group.add(createFlapTrackCanoes(canoePositions));
  group.add(createFlapTrackCanoes(canoePositions.map((c) => ({ ...c, x: -c.x }))));

  const slatGeo = new THREE.BoxGeometry(3.1, 0.038, 0.06);
  const rightSlat = new THREE.Mesh(slatGeo, slatMetalMat);
  rightSlat.position.set(1.9, -0.04, 0.05);
  rightSlat.rotation.y = -0.45;
  group.add(rightSlat);

  const leftSlat = rightSlat.clone();
  leftSlat.position.set(-1.9, -0.04, 0.05);
  leftSlat.rotation.y = 0.45;
  group.add(leftSlat);

  const flapMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35 });
  const aileronGeo = new THREE.BoxGeometry(0.92, 0.024, 0.14);
  const rightAileron = new THREE.Mesh(aileronGeo, flapMat);
  rightAileron.position.set(2.55, -0.03, 0.7);
  rightAileron.rotation.y = -0.42;
  group.add(rightAileron);

  const leftAileron = rightAileron.clone();
  leftAileron.position.set(-2.55, -0.03, 0.7);
  leftAileron.rotation.y = 0.42;
  group.add(leftAileron);

  // 4. Twin GEnx-1B Engines with Serrated Exhaust Chevrons
  const spinners: THREE.Group[] = [];
  const engR = createRealisticTurbofan({
    radius: 0.27,
    length: 1.08,
    cowlColor: 0xf8fafc,
    chevron: true,
  });
  engR.nacelleGroup.position.set(1.35, -0.34, -0.32);
  group.add(engR.nacelleGroup);
  spinners.push(engR.fanSpinner);

  const engL = createRealisticTurbofan({
    radius: 0.27,
    length: 1.08,
    cowlColor: 0xf8fafc,
    chevron: true,
  });
  engL.nacelleGroup.position.set(-1.35, -0.34, -0.32);
  group.add(engL.nacelleGroup);
  spinners.push(engL.fanSpinner);

  const pylonGeo = new THREE.BoxGeometry(0.06, 0.24, 0.65);
  const pylonR = new THREE.Mesh(pylonGeo, whiteMat);
  pylonR.position.set(1.35, -0.17, -0.22);
  group.add(pylonR);

  const pylonL = pylonR.clone();
  pylonL.position.set(-1.35, -0.17, -0.22);
  group.add(pylonL);

  // 5. Vertical Stabilizer & Articulated Rudder
  const tailAssembly = createVerticalTailAndRudder({
    finColor: boeingBlueMat,
    rudderColor: boeingBlueMat,
    rootY: 0.36,
    tipY: 2.0,
    finDorsalZ: 1.3,
    finLeadingRootZ: 1.8,
    finTipLeadingZ: 2.88,
    finTipHingeZ: 3.25,
    finRootHingeZ: 2.92,
    rudderRootChord: 0.35,
    rudderTipChord: 0.21,
    thickness: 0.048,
  });
  group.add(tailAssembly.group);

  // 6. Horizontal Stabilizer & Elevators
  const hTailAssembly = createHorizontalTailAndElevators({
    span: 1.3,
    rootChord: 0.48,
    tipChord: 0.3,
    sweepZ: 0.35,
    yPos: 0.1,
    rootZ: 2.7,
    stabColor: whiteMat,
    elevatorColor: flapMat,
  });
  group.add(hTailAssembly.group);

  const animate = (delta: number, pitchDeg = 0, rollDeg = 0, yawDeg = 0) => {
    spinners.forEach((s) => {
      s.rotation.z += delta * 24.0;
    });

    const rollDeflect = THREE.MathUtils.clamp(rollDeg * 0.009, -0.38, 0.38);
    rightAileron.rotation.x = rollDeflect;
    leftAileron.rotation.x = -rollDeflect;

    const pitchDeflect = THREE.MathUtils.clamp(pitchDeg * 0.01, -0.35, 0.35);
    hTailAssembly.setPitch(pitchDeflect);

    const yawDeflect = THREE.MathUtils.clamp(yawDeg * 0.008, -0.35, 0.35);
    tailAssembly.setYaw(yawDeflect);
  };

  return { group, name: 'Boeing 787-9 Dreamliner', type: 'boeing_787', animate };
}

/**
 * 3. BOEING 747-8 INTERCONTINENTAL ("Queen of the Skies")
 */
export function createBoeing747(): AircraftInstance {
  const group = new THREE.Group();
  group.name = 'Boeing747';

  const liveryTex = createRealisticFuselageTexture({
    stripeColor1: '#dc2626',
    stripeColor2: '#f59e0b',
    airlineName: 'BOEING 747-8',
    cockpitType: 'b747_hump',
    forwardHump: true,
  });

  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.25,
    metalness: 0.2,
  });

  const tailRedMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.26,
    metalness: 0.25,
  });

  // 1. Continuous Main Fuselage
  const b747Profile = [
    new THREE.Vector2(0.001, -3.75),
    new THREE.Vector2(0.18, -3.45),
    new THREE.Vector2(0.35, -3.05),
    new THREE.Vector2(0.44, -2.65),
    new THREE.Vector2(0.475, -2.25),
    new THREE.Vector2(0.48, -1.65),
    new THREE.Vector2(0.48, 1.85),
    new THREE.Vector2(0.45, 2.45),
    new THREE.Vector2(0.37, 3.10),
    new THREE.Vector2(0.24, 3.75),
    new THREE.Vector2(0.12, 4.15),
    new THREE.Vector2(0.04, 4.35),
  ];
  const fuselageMesh = createContinuousFuselage(b747Profile, liveryTex);
  group.add(fuselageMesh);

  // 2. Iconic 747 Upper-Deck Hump
  const humpGeo = new THREE.CapsuleGeometry(0.34, 1.75, 18, 28);
  humpGeo.rotateX(Math.PI / 2);
  const hump = new THREE.Mesh(humpGeo, whiteMat);
  hump.position.set(0, 0.26, -1.25);
  hump.scale.set(0.96, 0.88, 1.0);
  group.add(hump);

  // 3. Swept Wings & Control Surfaces
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -0.85);
  wingShape.lineTo(3.75, 1.15);
  wingShape.lineTo(3.95, 1.45);
  wingShape.lineTo(3.75, 1.55);
  wingShape.lineTo(0, 0.75);
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.065,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.016,
    bevelThickness: 0.016,
  });
  wingGeo.rotateX(Math.PI / 2);

  const rightWing = new THREE.Mesh(wingGeo, whiteMat);
  rightWing.position.set(0.38, -0.16, -0.1);
  rightWing.rotation.z = 0.055;
  group.add(rightWing);

  const leftWing = rightWing.clone();
  leftWing.scale.set(-1, 1, 1);
  leftWing.position.set(-0.38, -0.16, -0.1);
  leftWing.rotation.z = -0.055;
  group.add(leftWing);

  const canoePositions = [
    { x: 1.15, y: -0.25, z: 0.28, scale: 1.1 },
    { x: 1.85, y: -0.21, z: 0.52, scale: 1.0 },
    { x: 2.55, y: -0.17, z: 0.76, scale: 0.9 },
    { x: 3.25, y: -0.13, z: 1.02, scale: 0.8 },
  ];
  group.add(createFlapTrackCanoes(canoePositions));
  group.add(createFlapTrackCanoes(canoePositions.map((c) => ({ ...c, x: -c.x }))));

  const flapMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35 });
  const aileronGeo = new THREE.BoxGeometry(0.95, 0.026, 0.15);
  const rightAileron = new THREE.Mesh(aileronGeo, flapMat);
  rightAileron.position.set(2.8, -0.05, 0.85);
  rightAileron.rotation.y = -0.42;
  group.add(rightAileron);

  const leftAileron = rightAileron.clone();
  leftAileron.position.set(-2.8, -0.05, 0.85);
  leftAileron.rotation.y = 0.42;
  group.add(leftAileron);

  // 4. Four GEnx-2B Under-Wing Engines
  const spinners: THREE.Group[] = [];
  const enginePositions = [
    { x: 1.28, y: -0.38, z: -0.35 },
    { x: -1.28, y: -0.38, z: -0.35 },
    { x: 2.38, y: -0.28, z: 0.25 },
    { x: -2.38, y: -0.28, z: 0.25 },
  ];

  enginePositions.forEach((pos) => {
    const eng = createRealisticTurbofan({
      radius: 0.22,
      length: 0.92,
      cowlColor: 0xf8fafc,
      chevron: true,
    });
    eng.nacelleGroup.position.set(pos.x, pos.y, pos.z);
    group.add(eng.nacelleGroup);
    spinners.push(eng.fanSpinner);

    const pylonGeo = new THREE.BoxGeometry(0.055, 0.22, 0.55);
    const pylon = new THREE.Mesh(pylonGeo, whiteMat);
    pylon.position.set(pos.x, pos.y + 0.16, pos.z + 0.08);
    group.add(pylon);
  });

  // 5. Tall 747 Vertical Fin & Articulated Rudder
  const tailAssembly = createVerticalTailAndRudder({
    finColor: tailRedMat,
    rudderColor: tailRedMat,
    rootY: 0.4,
    tipY: 2.18,
    finDorsalZ: 1.45,
    finLeadingRootZ: 1.95,
    finTipLeadingZ: 3.05,
    finTipHingeZ: 3.48,
    finRootHingeZ: 3.12,
    rudderRootChord: 0.38,
    rudderTipChord: 0.23,
    thickness: 0.052,
  });
  group.add(tailAssembly.group);

  // 6. Horizontal Stabilizer & Elevators
  const hTailAssembly = createHorizontalTailAndElevators({
    span: 1.45,
    rootChord: 0.55,
    tipChord: 0.34,
    sweepZ: 0.42,
    yPos: 0.12,
    rootZ: 2.9,
    stabColor: whiteMat,
    elevatorColor: flapMat,
  });
  group.add(hTailAssembly.group);

  const animate = (delta: number, pitchDeg = 0, rollDeg = 0, yawDeg = 0) => {
    spinners.forEach((s) => {
      s.rotation.z += delta * 24.0;
    });

    const rollDeflect = THREE.MathUtils.clamp(rollDeg * 0.009, -0.38, 0.38);
    rightAileron.rotation.x = rollDeflect;
    leftAileron.rotation.x = -rollDeflect;

    const pitchDeflect = THREE.MathUtils.clamp(pitchDeg * 0.01, -0.35, 0.35);
    hTailAssembly.setPitch(pitchDeflect);

    const yawDeflect = THREE.MathUtils.clamp(yawDeg * 0.008, -0.35, 0.35);
    tailAssembly.setYaw(yawDeflect);
  };

  return { group, name: 'Boeing 747-8 Intercontinental', type: 'boeing_747', animate };
}

/**
 * 4. AIRBUS A380-800 SUPERJUMBO
 */
export function createAirbusA380(): AircraftInstance {
  const group = new THREE.Group();
  group.name = 'AirbusA380';

  const liveryTex = createRealisticFuselageTexture({
    stripeColor1: '#0284c7',
    stripeColor2: '#38bdf8',
    airlineName: 'AIRBUS A380',
    cockpitType: 'a380_wide',
    doubleDeck: true,
  });

  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.25,
    metalness: 0.2,
  });

  const airbusTealMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.26,
    metalness: 0.25,
  });

  // 1. Continuous Double-Deck Ovoid Fuselage
  const a380Profile = [
    new THREE.Vector2(0.001, -3.65),
    new THREE.Vector2(0.18, -3.32),
    new THREE.Vector2(0.36, -2.92),
    new THREE.Vector2(0.48, -2.52),
    new THREE.Vector2(0.515, -2.15),
    new THREE.Vector2(0.52, -1.55),
    new THREE.Vector2(0.52, 1.85),
    new THREE.Vector2(0.49, 2.45),
    new THREE.Vector2(0.40, 3.10),
    new THREE.Vector2(0.26, 3.75),
    new THREE.Vector2(0.13, 4.15),
    new THREE.Vector2(0.045, 4.35),
  ];
  const fuselageMesh = createContinuousFuselage(a380Profile, liveryTex);
  fuselageMesh.scale.set(0.96, 1.18, 1.0);
  group.add(fuselageMesh);

  // 3. Wings with Wingtip Fences & Flap Canoes
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -0.95);
  wingShape.lineTo(4.0, 1.05);
  wingShape.lineTo(4.0, 1.45);
  wingShape.lineTo(0, 0.85);
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.016,
    bevelThickness: 0.016,
  });
  wingGeo.rotateX(Math.PI / 2);

  const rightWing = new THREE.Mesh(wingGeo, whiteMat);
  rightWing.position.set(0.4, -0.22, -0.1);
  rightWing.rotation.z = 0.06;
  group.add(rightWing);

  const leftWing = rightWing.clone();
  leftWing.scale.set(-1, 1, 1);
  leftWing.position.set(-0.4, -0.22, -0.1);
  leftWing.rotation.z = -0.06;
  group.add(leftWing);

  const fenceGeo = new THREE.BoxGeometry(0.03, 0.42, 0.48);
  const rightFence = new THREE.Mesh(fenceGeo, airbusTealMat);
  rightFence.position.set(4.35, 0.04, 1.25);
  group.add(rightFence);

  const leftFence = rightFence.clone();
  leftFence.position.set(-4.35, 0.04, 1.25);
  group.add(leftFence);

  const canoePositions = [
    { x: 1.25, y: -0.32, z: 0.28, scale: 1.15 },
    { x: 2.05, y: -0.28, z: 0.55, scale: 1.05 },
    { x: 2.85, y: -0.23, z: 0.82, scale: 0.95 },
    { x: 3.65, y: -0.18, z: 1.12, scale: 0.85 },
  ];
  group.add(createFlapTrackCanoes(canoePositions));
  group.add(createFlapTrackCanoes(canoePositions.map((c) => ({ ...c, x: -c.x }))));

  const flapMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35 });
  const aileronGeo = new THREE.BoxGeometry(1.0, 0.026, 0.16);
  const rightAileron = new THREE.Mesh(aileronGeo, flapMat);
  rightAileron.position.set(3.1, -0.06, 0.95);
  rightAileron.rotation.y = -0.42;
  group.add(rightAileron);

  const leftAileron = rightAileron.clone();
  leftAileron.position.set(-3.1, -0.06, 0.95);
  leftAileron.rotation.y = 0.42;
  group.add(leftAileron);

  // 4. Four Rolls-Royce Trent 900 Turbofans
  const spinners: THREE.Group[] = [];
  const enginePositions = [
    { x: 1.35, y: -0.45, z: -0.28 },
    { x: -1.35, y: -0.45, z: -0.28 },
    { x: 2.65, y: -0.35, z: 0.35 },
    { x: -2.65, y: -0.35, z: 0.35 },
  ];

  enginePositions.forEach((pos) => {
    const eng = createRealisticTurbofan({
      radius: 0.25,
      length: 1.05,
      cowlColor: 0xf8fafc,
      chevron: false,
    });
    eng.nacelleGroup.position.set(pos.x, pos.y, pos.z);
    group.add(eng.nacelleGroup);
    spinners.push(eng.fanSpinner);

    const pylonGeo = new THREE.BoxGeometry(0.06, 0.24, 0.6);
    const pylon = new THREE.Mesh(pylonGeo, whiteMat);
    pylon.position.set(pos.x, pos.y + 0.18, pos.z + 0.08);
    group.add(pylon);
  });

  // 5. Colossal Vertical Fin & Articulated Rudder
  const tailAssembly = createVerticalTailAndRudder({
    finColor: airbusTealMat,
    rudderColor: airbusTealMat,
    rootY: 0.5,
    tipY: 2.38,
    finDorsalZ: 1.4,
    finLeadingRootZ: 1.95,
    finTipLeadingZ: 3.12,
    finTipHingeZ: 3.55,
    finRootHingeZ: 3.18,
    rudderRootChord: 0.42,
    rudderTipChord: 0.25,
    thickness: 0.058,
  });
  group.add(tailAssembly.group);

  // 6. Horizontal Stabilizer & Elevators
  const hTailAssembly = createHorizontalTailAndElevators({
    span: 1.55,
    rootChord: 0.58,
    tipChord: 0.36,
    sweepZ: 0.45,
    yPos: 0.18,
    rootZ: 2.95,
    stabColor: whiteMat,
    elevatorColor: flapMat,
  });
  group.add(hTailAssembly.group);

  const animate = (delta: number, pitchDeg = 0, rollDeg = 0, yawDeg = 0) => {
    spinners.forEach((s) => {
      s.rotation.z += delta * 24.0;
    });

    const rollDeflect = THREE.MathUtils.clamp(rollDeg * 0.009, -0.38, 0.38);
    rightAileron.rotation.x = rollDeflect;
    leftAileron.rotation.x = -rollDeflect;

    const pitchDeflect = THREE.MathUtils.clamp(pitchDeg * 0.01, -0.35, 0.35);
    hTailAssembly.setPitch(pitchDeflect);

    const yawDeflect = THREE.MathUtils.clamp(yawDeg * 0.008, -0.35, 0.35);
    tailAssembly.setYaw(yawDeflect);
  };

  return { group, name: 'Airbus A380-800 Superjumbo', type: 'airbus_a380', animate };
}

/**
 * Generates a high-detail procedural tactical stealth camo & panel-line texture for the F-22 Raptor.
 */
function createRaptorStealthTexture(): THREE.CanvasTexture {
  const canvas = createSafeCanvas(1024, 1024);
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Base metallic Raptor tactical gray
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, 0, 1024, 1024);

  // Disruptive darker radar-absorbent material (RAM) camo patches
  ctx.fillStyle = '#334155';
  const camoPolys = [
    [
      [180, 120],
      [420, 80],
      [480, 290],
      [220, 340],
    ],
    [
      [540, 90],
      [840, 130],
      [790, 350],
      [560, 310],
    ],
    [
      [140, 440],
      [460, 390],
      [510, 680],
      [190, 720],
    ],
    [
      [530, 410],
      [880, 460],
      [830, 740],
      [550, 690],
    ],
    [
      [260, 760],
      [760, 760],
      [710, 960],
      [310, 960],
    ],
  ];

  camoPolys.forEach((poly) => {
    ctx.beginPath();
    poly.forEach(([x, y], idx) => {
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  });

  // Lighter RAM edge trim & sawtooth stealth panel lines
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  for (let y = 140; y < 960; y += 110) {
    ctx.beginPath();
    ctx.moveTo(60, y);
    for (let x = 60; x <= 964; x += 32) {
      const zig = (x / 32) % 2 === 0 ? -6 : 6;
      ctx.lineTo(x, y + zig);
    }
    ctx.stroke();
  }

  // Longitudinal stealth bay seams
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  [360, 512, 664].forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, 60);
    ctx.lineTo(x, 980);
    ctx.stroke();
  });

  // Low-visibility USAF tactical insignia roundel
  ctx.save();
  ctx.translate(250, 560);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-42, -12, 84, 24);
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fillStyle = '#334155';
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 5. LOCKHEED MARTIN F-22A RAPTOR (F-22X SUPERSONIC STEALTH FIGHTER)
 * Built with authentic chined stealth fuselage stations, swept caret supersonic intakes,
 * diamond-delta supercritical wings, outward-canted twin vertical stabilizers with articulated
 * rudders, all-moving horizontal stabilators (tailerons), twin 2D pitch-vectoring thrust nozzles
 * with afterburner cores, and a frameless gold-iridium teardrop bubble canopy over a detailed cockpit.
 */
export function createFighterJet(): AircraftInstance {
  const group = new THREE.Group();
  group.name = 'FighterJet';

  const raptorTex = createRaptorStealthTexture();

  const stealthBodyMat = new THREE.MeshStandardMaterial({
    map: raptorTex,
    roughness: 0.36,
    metalness: 0.48,
  });

  const stealthEdgeMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.32,
    metalness: 0.52,
  });

  const radomeMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.42,
    metalness: 0.35,
  });

  const darkIntakeMat = new THREE.MeshStandardMaterial({
    color: 0x090d16,
    roughness: 0.85,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });

  const nozzleTitaniumMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.28,
    metalness: 0.85,
  });

  const afterburnerCoreMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
  });

  const afterburnerInnerMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
  });

  const canopyGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xd97706,
    emissive: 0x451a03,
    emissiveIntensity: 0.18,
    roughness: 0.06,
    metalness: 0.38,
    transparent: true,
    opacity: 0.62,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    reflectivity: 0.95,
  });

  // ============================================================================
  // 1. LOFTED STEALTH CHINED FUSELAGE (Hexagonal Stealth Cross-Sections)
  // ============================================================================
  // Each station defines: z, halfWidth (at sharp side chine), topY, chineY, bottomY, topHalfWidth
  interface FuselageStation {
    z: number;
    w: number;      // Half-width at sharp side chine
    topW: number;   // Half-width of upper dorsal deck
    botW: number;   // Half-width of flat stealth belly
    topY: number;   // Upper spine elevation
    chineY: number; // Sharp radar-deflecting chine elevation
    botY: number;   // Lower belly elevation
  }

  const stations: FuselageStation[] = [
    { z: -3.85, w: 0.002, topW: 0.001, botW: 0.001, topY: -0.04, chineY: -0.04, botY: -0.04 }, // Sharp Nose Tip
    { z: -3.45, w: 0.16,  topW: 0.06,  botW: 0.08,  topY: 0.03,  chineY: -0.03, botY: -0.09 }, // Radome Fore
    { z: -2.95, w: 0.32,  topW: 0.14,  botW: 0.18,  topY: 0.10,  chineY: -0.01, botY: -0.14 }, // Radome Bulkhead
    { z: -2.35, w: 0.44,  topW: 0.20,  botW: 0.26,  topY: 0.16,  chineY: 0.01,  botY: -0.17 }, // Forward Cockpit Sill
    { z: -1.55, w: 0.54,  topW: 0.23,  botW: 0.34,  topY: 0.19,  chineY: 0.02,  botY: -0.19 }, // Mid Cockpit / Chine Flare
    { z: -0.95, w: 0.72,  topW: 0.34,  botW: 0.56,  topY: 0.22,  chineY: 0.03,  botY: -0.22 }, // Caret Intake Leading Station
    { z: -0.15, w: 0.78,  topW: 0.44,  botW: 0.64,  topY: 0.24,  chineY: 0.03,  botY: -0.22 }, // Main Weapons Bay / Wing Root Fore
    { z:  0.85, w: 0.76,  topW: 0.46,  botW: 0.62,  topY: 0.22,  chineY: 0.02,  botY: -0.20 }, // Mid Wing Root / Engine Bay
    { z:  1.75, w: 0.68,  topW: 0.44,  botW: 0.54,  topY: 0.18,  chineY: 0.02,  botY: -0.17 }, // Aft Twin Engine Shroud
    { z:  2.35, w: 0.56,  topW: 0.42,  botW: 0.44,  topY: 0.13,  chineY: 0.01,  botY: -0.13 }, // Thrust Vectoring Nozzle Mount
  ];

  // 8 vertices per station around the perimeter (clockwise looking from aft):
  // 0: Top Center (0, topY)
  // 1: Top Right Deck (topW, topY * 0.92)
  // 2: Right Sharp Chine (w, chineY)
  // 3: Bottom Right Chine (botW, botY)
  // 4: Bottom Center (0, botY)
  // 5: Bottom Left Chine (-botW, botY)
  // 6: Left Sharp Chine (-w, chineY)
  // 7: Top Left Deck (-topW, topY * 0.92)
  const ringPts = 8;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const minZ = stations[0].z;
  const maxZ = stations[stations.length - 1].z;

  stations.forEach((st) => {
    const ring: [number, number, number][] = [
      [0, st.topY, st.z],
      [st.topW, st.topY * 0.92 + st.chineY * 0.08, st.z],
      [st.w, st.chineY, st.z],
      [st.botW, st.botY, st.z],
      [0, st.botY, st.z],
      [-st.botW, st.botY, st.z],
      [-st.w, st.chineY, st.z],
      [-st.topW, st.topY * 0.92 + st.chineY * 0.08, st.z],
    ];

    const vCoord = (st.z - minZ) / (maxZ - minZ);
    ring.forEach(([x, y, z]) => {
      positions.push(x, y, z);
      const uCoord = 0.5 + x / 1.6;
      uvs.push(uCoord, vCoord);
    });
  });

  for (let s = 0; s < stations.length - 1; s++) {
    const baseA = s * ringPts;
    const baseB = (s + 1) * ringPts;
    for (let i = 0; i < ringPts; i++) {
      const nextI = (i + 1) % ringPts;
      const a0 = baseA + i;
      const a1 = baseA + nextI;
      const b0 = baseB + i;
      const b1 = baseB + nextI;

      indices.push(a0, b0, a1);
      indices.push(a1, b0, b1);
    }
  }

  const fuselageGeo = new THREE.BufferGeometry();
  fuselageGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  fuselageGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  fuselageGeo.setIndex(indices);
  fuselageGeo.computeVertexNormals();

  const fuselageMesh = new THREE.Mesh(fuselageGeo, stealthBodyMat);
  group.add(fuselageMesh);

  // Distinct Dark Gray Radar-Absorbent Nose Radome Cone Overlay (-3.85 to -2.95)
  const radomePositions: number[] = [];
  const radomeIndices: number[] = [];
  for (let s = 0; s < 3; s++) {
    const st = stations[s];
    const scale = 1.003;
    const ring: [number, number, number][] = [
      [0, st.topY * scale, st.z],
      [st.topW * scale, (st.topY * 0.92 + st.chineY * 0.08) * scale, st.z],
      [st.w * scale, st.chineY * scale, st.z],
      [st.botW * scale, st.botY * scale, st.z],
      [0, st.botY * scale, st.z],
      [-st.botW * scale, st.botY * scale, st.z],
      [-st.w * scale, st.chineY * scale, st.z],
      [-st.topW * scale, (st.topY * 0.92 + st.chineY * 0.08) * scale, st.z],
    ];
    ring.forEach(([x, y, z]) => radomePositions.push(x, y, z));
  }
  for (let s = 0; s < 2; s++) {
    const baseA = s * ringPts;
    const baseB = (s + 1) * ringPts;
    for (let i = 0; i < ringPts; i++) {
      const nextI = (i + 1) % ringPts;
      radomeIndices.push(baseA + i, baseB + i, baseA + nextI);
      radomeIndices.push(baseA + nextI, baseB + i, baseB + nextI);
    }
  }
  const radomeGeo = new THREE.BufferGeometry();
  radomeGeo.setAttribute('position', new THREE.Float32BufferAttribute(radomePositions, 3));
  radomeGeo.setIndex(radomeIndices);
  radomeGeo.computeVertexNormals();
  group.add(new THREE.Mesh(radomeGeo, radomeMat));

  // ============================================================================
  // 2. SWEPT CARET SUPERSONIC ENGINE INTAKES (Port & Starboard)
  // ============================================================================
  [-1, 1].forEach((side) => {
    const intakeGroup = new THREE.Group();

    // Outer Caret Cowl Lip (Swept Rhomboid Duct)
    const cowlShape = new THREE.Shape();
    cowlShape.moveTo(0, 0);
    cowlShape.lineTo(0.28 * side, -0.02);
    cowlShape.lineTo(0.22 * side, -0.24);
    cowlShape.lineTo(0, -0.22);
    cowlShape.closePath();

    const cowlGeo = new THREE.ExtrudeGeometry(cowlShape, {
      depth: 0.95,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.015,
      bevelSegments: 2,
    });
    const cowlMesh = new THREE.Mesh(cowlGeo, stealthEdgeMat);
    cowlMesh.position.set(side * 0.44, 0.02, -1.05);
    cowlMesh.rotation.y = side * -0.06;
    intakeGroup.add(cowlMesh);

    // Dark Supersonic Intake Mouth Cavity
    const mouthGeo = new THREE.PlaneGeometry(0.24, 0.20);
    const mouthMesh = new THREE.Mesh(mouthGeo, darkIntakeMat);
    mouthMesh.position.set(side * 0.56, -0.09, -1.052);
    mouthMesh.rotation.y = side * 0.25;
    mouthMesh.rotation.x = 0.18;
    intakeGroup.add(mouthMesh);

    group.add(intakeGroup);
  });

  // ============================================================================
  // 3. DETAILED FIGHTER COCKPIT TUB, ACES II EJECTION SEAT, HUD & GOLD CANOPY
  // ============================================================================
  const cockpitGroup = new THREE.Group();
  cockpitGroup.position.set(0, 0.16, -1.75);

  const cockpitTubMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.7,
    metalness: 0.2,
  });

  // Cockpit Sill Coaming
  const sillGeo = new THREE.BoxGeometry(0.36, 0.05, 1.38);
  const sill = new THREE.Mesh(sillGeo, cockpitTubMat);
  sill.position.set(0, 0.0, 0.05);
  cockpitGroup.add(sill);

  // ACES II Slanted Ejection Seat
  const seatGroup = new THREE.Group();
  seatGroup.position.set(0, 0.03, 0.12);
  seatGroup.rotation.x = -0.26; // Authentic F-22 15-degree reclined seat angle

  const seatBucket = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.05, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
  );
  seatGroup.add(seatBucket);

  const seatBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.28, 0.045),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 })
  );
  seatBack.position.set(0, 0.15, 0.07);
  seatGroup.add(seatBack);

  // Twin Ejection Parachute Headbox & Pitot Ears
  const headBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.09, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.5 })
  );
  headBox.position.set(0, 0.31, 0.065);
  seatGroup.add(headBox);

  // Yellow/Black Ejection Handle Loop
  const handleLoop = new THREE.Mesh(
    new THREE.TorusGeometry(0.018, 0.005, 8, 12),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 })
  );
  handleLoop.position.set(0, 0.04, -0.08);
  handleLoop.rotation.x = Math.PI / 2;
  seatGroup.add(handleLoop);

  cockpitGroup.add(seatGroup);

  // Forward Avionics Glareshield & Glowing MFD Screens
  const glareshield = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.08, 0.24),
    cockpitTubMat
  );
  glareshield.position.set(0, 0.07, -0.32);
  cockpitGroup.add(glareshield);

  // Holographic Wide-Angle HUD Combiner Glass
  const hudGlassMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });
  const hudCombiner = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.09), hudGlassMat);
  hudCombiner.position.set(0, 0.15, -0.30);
  hudCombiner.rotation.x = -0.48;
  cockpitGroup.add(hudCombiner);

  group.add(cockpitGroup);

  // Frameless Teardrop Gold-Iridium Bubble Canopy (Sculpted Lathe Profile)
  const canopyPoints = [
    new THREE.Vector2(0.001, -2.55), // Forward windshield base apex
    new THREE.Vector2(0.12, -2.35),  // Sloped forward windscreen
    new THREE.Vector2(0.20, -2.05),  // HUD crown
    new THREE.Vector2(0.22, -1.72),  // Peak bubble arch over pilot head
    new THREE.Vector2(0.19, -1.35),  // Aft canopy taper
    new THREE.Vector2(0.12, -1.02),  // Dorsal spine blend
    new THREE.Vector2(0.001, -0.82), // Rear canopy tail apex
  ];
  const canopyLatheGeo = new THREE.LatheGeometry(canopyPoints, 32, Math.PI * 0.5, Math.PI);
  canopyLatheGeo.rotateX(Math.PI / 2);
  // Scale width vs height for sleek teardrop fighter cross-section
  canopyLatheGeo.scale(0.95, 0.92, 1.0);

  const canopyMesh = new THREE.Mesh(canopyLatheGeo, canopyGlassMat);
  canopyMesh.position.set(0, 0.155, 0);
  group.add(canopyMesh);

  // ============================================================================
  // 4. AUTHENTIC F-22 DIAMOND-DELTA SUPERCRITICAL WINGS & CONTROL SURFACES
  // ============================================================================
  // Shape coordinates: X = spanwise outboard (0 from wing root at X=0.65), Y = Z chordwise
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -0.65);     // Wing root leading edge (blends behind intake)
  wingShape.lineTo(2.05, 0.82);   // 42-deg swept leading edge to wingtip fore corner
  wingShape.lineTo(2.05, 1.24);   // Clipped stealth wingtip chord
  wingShape.lineTo(0, 1.55);      // -17-deg forward-swept trailing edge to root
  wingShape.closePath();

  const wingExtrudeSettings = {
    depth: 0.036,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.014,
    bevelThickness: 0.012,
  };

  const rightWingGeo = new THREE.ExtrudeGeometry(wingShape, wingExtrudeSettings);
  rightWingGeo.rotateX(Math.PI / 2);
  const rightWing = new THREE.Mesh(rightWingGeo, stealthBodyMat);
  rightWing.position.set(0.62, 0.035, 0.0);
  rightWing.rotation.z = -0.025; // Subtle fighter anhedral
  group.add(rightWing);

  const leftWing = rightWing.clone();
  leftWing.scale.set(-1, 1, 1);
  leftWing.position.set(-0.62, 0.035, 0.0);
  leftWing.rotation.z = 0.025;
  group.add(leftWing);

  // Articulated Outboard Ailerons / Flaperons (Aligned to -17 deg trailing edge)
  const flaperonGeo = new THREE.BoxGeometry(1.15, 0.024, 0.18);
  const rightAileron = new THREE.Mesh(flaperonGeo, stealthEdgeMat);
  rightAileron.position.set(1.55, 0.01, 1.38);
  rightAileron.rotation.y = 0.15; // Matches forward-swept trailing edge angle
  group.add(rightAileron);

  const leftAileron = rightAileron.clone();
  leftAileron.position.set(-1.55, 0.01, 1.38);
  leftAileron.rotation.y = -0.15;
  group.add(leftAileron);

  // Wingtip Tactical Stealth Nav Strobe Lights
  const navGreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.018, 0.12),
    new THREE.MeshBasicMaterial({ color: 0x22c55e })
  );
  navGreen.position.set(2.67, -0.015, 1.02);
  group.add(navGreen);

  const navRed = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.018, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xef4444 })
  );
  navRed.position.set(-2.67, -0.015, 1.02);
  group.add(navRed);

  // ============================================================================
  // 5. TWIN OUTWARD-CANTED (28°) VERTICAL STABILIZERS & ARTICULATED RUDDERS
  // ============================================================================
  const rightTail = createVerticalTailAndRudder({
    finColor: stealthBodyMat,
    rudderColor: stealthEdgeMat,
    rootY: 0.0,
    tipY: 1.08,
    finDorsalZ: 0.85,
    finLeadingRootZ: 1.05,
    finTipLeadingZ: 1.72,
    finTipHingeZ: 2.08,
    finRootHingeZ: 1.92,
    rudderRootChord: 0.26,
    rudderTipChord: 0.18,
    thickness: 0.036,
  });
  rightTail.group.position.set(0.52, 0.12, 0.0);
  rightTail.group.rotation.z = -0.48; // 27.5° outward stealth cant
  group.add(rightTail.group);

  const leftTail = createVerticalTailAndRudder({
    finColor: stealthBodyMat,
    rudderColor: stealthEdgeMat,
    rootY: 0.0,
    tipY: 1.08,
    finDorsalZ: 0.85,
    finLeadingRootZ: 1.05,
    finTipLeadingZ: 1.72,
    finTipHingeZ: 2.08,
    finRootHingeZ: 1.92,
    rudderRootChord: 0.26,
    rudderTipChord: 0.18,
    thickness: 0.036,
  });
  leftTail.group.position.set(-0.52, 0.12, 0.0);
  leftTail.group.rotation.z = 0.48; // 27.5° outward stealth cant
  group.add(leftTail.group);

  // ============================================================================
  // 6. ALL-MOVING HORIZONTAL STABILATORS (TAILERONS)
  // ============================================================================
  const stabShape = new THREE.Shape();
  stabShape.moveTo(0, -0.38);
  stabShape.lineTo(0.98, 0.25);
  stabShape.lineTo(0.88, 0.52);
  stabShape.lineTo(0, 0.42);
  stabShape.closePath();

  const stabGeo = new THREE.ExtrudeGeometry(stabShape, {
    depth: 0.026,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  });
  stabGeo.rotateX(Math.PI / 2);

  const rightStabPivot = new THREE.Group();
  rightStabPivot.position.set(0.60, 0.01, 2.05);
  const rightStabMesh = new THREE.Mesh(stabGeo, stealthBodyMat);
  rightStabPivot.add(rightStabMesh);
  group.add(rightStabPivot);

  const leftStabPivot = new THREE.Group();
  leftStabPivot.position.set(-0.60, 0.01, 2.05);
  const leftStabMesh = rightStabMesh.clone();
  leftStabMesh.scale.set(-1, 1, 1);
  leftStabPivot.add(leftStabMesh);
  group.add(leftStabPivot);

  // ============================================================================
  // 7. TWIN 2D PITCH-VECTORING EXHAUST NOZZLES WITH AFTERBURNER CORES
  // ============================================================================
  const nozzlePivots: THREE.Group[] = [];
  [-0.25, 0.25].forEach((xOffset) => {
    const nozzleGroup = new THREE.Group();
    nozzleGroup.position.set(xOffset, 0.0, 2.36);

    // Rectangular 2D Stealth Shroud Collar
    const shroudGeo = new THREE.BoxGeometry(0.38, 0.20, 0.28);
    const shroud = new THREE.Mesh(shroudGeo, nozzleTitaniumMat);
    shroud.position.z = 0.08;
    nozzleGroup.add(shroud);

    // Upper & Lower Pitch-Vectoring Turkey-Feather Paddles
    const paddleGeo = new THREE.BoxGeometry(0.35, 0.035, 0.22);
    const upperPaddle = new THREE.Mesh(paddleGeo, stealthEdgeMat);
    upperPaddle.position.set(0, 0.075, 0.22);
    upperPaddle.rotation.x = 0.14;
    nozzleGroup.add(upperPaddle);

    const lowerPaddle = new THREE.Mesh(paddleGeo, stealthEdgeMat);
    lowerPaddle.position.set(0, -0.075, 0.22);
    lowerPaddle.rotation.x = -0.14;
    nozzleGroup.add(lowerPaddle);

    // Deep Afterburner Combustor Cavity & Glowing Rings
    const cavity = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.13, 0.05),
      darkIntakeMat
    );
    cavity.position.z = 0.21;
    nozzleGroup.add(cavity);

    const burnerOuter = new THREE.Mesh(
      new THREE.RingGeometry(0.038, 0.062, 16),
      afterburnerCoreMat
    );
    burnerOuter.position.z = 0.24;
    nozzleGroup.add(burnerOuter);

    const burnerInner = new THREE.Mesh(
      new THREE.CircleGeometry(0.036, 16),
      afterburnerInnerMat
    );
    burnerInner.position.z = 0.242;
    nozzleGroup.add(burnerInner);

    group.add(nozzleGroup);
    nozzlePivots.push(nozzleGroup);
  });

  // ============================================================================
  // 8. REAL-TIME KINEMATIC CONTROL SURFACE & THRUST-VECTORING ANIMATION
  // ============================================================================
  const animate = (_delta: number, pitchDeg = 0, rollDeg = 0, yawDeg = 0) => {
    const rollDeflect = THREE.MathUtils.clamp(rollDeg * 0.012, -0.45, 0.45);
    rightAileron.rotation.x = rollDeflect;
    leftAileron.rotation.x = -rollDeflect;

    // All-moving horizontal stabilators (combined pitch + differential roll tailerons)
    const pitchDeflect = THREE.MathUtils.clamp(pitchDeg * 0.012, -0.42, 0.42);
    rightStabPivot.rotation.x = pitchDeflect + rollDeflect * 0.35;
    leftStabPivot.rotation.x = pitchDeflect - rollDeflect * 0.35;

    // 2D Thrust-Vectoring Nozzles vector synchronously with pitch
    nozzlePivots.forEach((nozzle) => {
      nozzle.rotation.x = pitchDeflect * 0.65;
    });

    // Twin canted rudders deflect cleanly along their swept hinge axes
    const yawDeflect = THREE.MathUtils.clamp(yawDeg * 0.01, -0.38, 0.38);
    rightTail.setYaw(yawDeflect);
    leftTail.setYaw(yawDeflect);
  };

  return { group, name: 'F-22X Supersonic Testbed', type: 'fighter_jet', animate };
}

/**
 * 6. EXTRA 330SC AEROBATIC
 */
export function createStuntPlane(): AircraftInstance {
  const group = new THREE.Group();
  group.name = 'StuntPlane';

  const redMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.2,
    metalness: 0.3,
  });

  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.25,
    metalness: 0.2,
  });

  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.05,
    metalness: 0.4,
    transparent: true,
    opacity: 0.65,
    clearcoat: 1.0,
  });

  const fuselageGeo = new THREE.CylinderGeometry(0.24, 0.12, 3.2, 20);
  fuselageGeo.rotateX(Math.PI / 2);
  const fuselage = new THREE.Mesh(fuselageGeo, redMat);
  group.add(fuselage);

  const cowlGeo = new THREE.ConeGeometry(0.24, 0.6, 20);
  cowlGeo.rotateX(-Math.PI / 2);
  const cowl = new THREE.Mesh(cowlGeo, whiteMat);
  cowl.position.z = -1.8;
  group.add(cowl);

  const propGroup = new THREE.Group();
  propGroup.position.z = -2.12;

  const propSpinnerGeo = new THREE.ConeGeometry(0.09, 0.22, 16);
  propSpinnerGeo.rotateX(-Math.PI / 2);
  const propSpinner = new THREE.Mesh(propSpinnerGeo, redMat);
  propGroup.add(propSpinner);

  const propBladeGeo = new THREE.BoxGeometry(0.04, 0.65, 0.012);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 });
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const blade = new THREE.Mesh(propBladeGeo, bladeMat);
    blade.position.set(Math.cos(angle) * 0.28, Math.sin(angle) * 0.28, 0);
    blade.rotation.z = angle;
    blade.rotation.x = 0.3;
    propGroup.add(blade);
  }
  group.add(propGroup);

  const pilotSeat = new THREE.Group();
  const seatGeo = new THREE.BoxGeometry(0.1, 0.16, 0.1);
  const seat = new THREE.Mesh(seatGeo, new THREE.MeshStandardMaterial({ color: 0x1e293b }));
  seat.position.set(0, 0.06, 0.1);
  pilotSeat.add(seat);
  group.add(pilotSeat);

  const canopyGeo = new THREE.CapsuleGeometry(0.14, 0.72, 10, 16);
  canopyGeo.rotateX(Math.PI / 2);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(0, 0.16, 0.05);
  canopy.scale.set(0.9, 0.85, 1.1);
  group.add(canopy);

  const wingGeo = new THREE.BoxGeometry(3.6, 0.045, 0.65);
  const wing = new THREE.Mesh(wingGeo, redMat);
  wing.position.set(0, -0.04, -0.15);
  group.add(wing);

  const aileronGeo = new THREE.BoxGeometry(1.4, 0.024, 0.18);
  const rightAileron = new THREE.Mesh(aileronGeo, whiteMat);
  rightAileron.position.set(1.05, -0.04, 0.24);
  group.add(rightAileron);

  const leftAileron = rightAileron.clone();
  leftAileron.position.set(-1.05, -0.04, 0.24);
  group.add(leftAileron);

  const rudderGeo = new THREE.BoxGeometry(0.03, 0.82, 0.42);
  const rudder = new THREE.Mesh(rudderGeo, whiteMat);
  rudder.position.set(0, 0.4, 1.6);
  group.add(rudder);

  const elevGeo = new THREE.BoxGeometry(1.2, 0.022, 0.26);
  const elevator = new THREE.Mesh(elevGeo, whiteMat);
  elevator.position.set(0, 0.04, 1.65);
  group.add(elevator);

  const animate = (delta: number, pitchDeg = 0, rollDeg = 0, yawDeg = 0) => {
    propGroup.rotation.z += delta * 45.0;

    const rollDeflect = THREE.MathUtils.clamp(rollDeg * 0.015, -0.5, 0.5);
    rightAileron.rotation.x = rollDeflect;
    leftAileron.rotation.x = -rollDeflect;

    const pitchDeflect = THREE.MathUtils.clamp(pitchDeg * 0.015, -0.45, 0.45);
    elevator.rotation.x = pitchDeflect;

    const yawDeflect = THREE.MathUtils.clamp(yawDeg * 0.012, -0.45, 0.45);
    rudder.rotation.y = yawDeflect;
  };

  return { group, name: 'Extra 330SC Aerobatic', type: 'stunt_plane', animate };
}
