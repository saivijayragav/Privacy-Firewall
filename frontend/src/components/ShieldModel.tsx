"use client";

import { useRef, useMemo, useEffect, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Sphere, useTexture } from "@react-three/drei";
import * as THREE from "three";

/* ─── Scroll hook: 0→1 over the first 800px ─── */
function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  const handleScroll = useCallback(() => {
    const raw = window.scrollY / 800;
    setProgress(Math.min(raw, 1));
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return progress;
}

/* ─── Smooth lerp ref ─── */
function useSmoothScroll(target: number, damping = 0.06) {
  const ref = useRef(0);
  useFrame(() => {
    ref.current += (target - ref.current) * damping;
  });
  return ref;
}

/* ─── Orbital arc (thin torus) ─── */
/* ─── Static orbital arc (no individual animation) ─── */
function OrbitalArc({
  radius,
  tubeRadius,
  color,
  arc,
  rotation,
  opacity,
}: {
  radius: number;
  tubeRadius: number;
  color: string;
  arc: number;
  rotation: [number, number, number];
  opacity: number;
}) {
  return (
    <mesh rotation={rotation}>
      <torusGeometry args={[radius, tubeRadius, 32, 200, arc]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ─── Group that rotates all arcs together on all 3 axes ─── */
function ArcsGroup({ scroll }: { scroll: number }) {
  const ref = useRef<THREE.Group>(null);
  const s = useSmoothScroll(scroll);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    // Idle: slow tumble on all 3 axes. Scroll: dramatically faster.
    ref.current.rotation.x = t * 0.08 + s.current * Math.PI * 3;
    ref.current.rotation.y = t * 0.12 + s.current * Math.PI * 5;
    ref.current.rotation.z = t * 0.05 + s.current * Math.PI * 1.6;
  });

  return (
    <group ref={ref}>
      {/* Arc 1 — 0° */}
      <OrbitalArc
        radius={1.85}
        tubeRadius={0.015}
        color="#06b6d4"
        arc={Math.PI * 2}
        rotation={[0.35, 0, 0]}
        opacity={0.5}
      />
      {/* Arc 2 — 45° */}
      <OrbitalArc
        radius={1.85}
        tubeRadius={0.012}
        color="#22d3ee"
        arc={Math.PI * 2}
        rotation={[0.35, Math.PI * 0.25, 0]}
        opacity={0.4}
      />
      {/* Arc 3 — 90° */}
      <OrbitalArc
        radius={1.85}
        tubeRadius={0.01}
        color="#67e8f9"
        arc={Math.PI * 2}
        rotation={[0.35, Math.PI * 0.5, 0]}
        opacity={0.35}
      />
      {/* Arc 4 — 135° */}
      <OrbitalArc
        radius={1.85}
        tubeRadius={0.012}
        color="#06b6d4"
        arc={Math.PI * 2}
        rotation={[0.35, Math.PI * 0.75, 0]}
        opacity={0.35}
      />
    </group>
  );
}

/* ─── Network lines on the globe surface ─── */
function NetworkLines({ scroll }: { scroll: number }) {
  const ref = useRef<THREE.LineSegments>(null);
  const s = useSmoothScroll(scroll);
  const lineCount = 60;

  const positions = useMemo(() => {
    const pos: number[] = [];
    for (let i = 0; i < lineCount; i++) {
      // random great-circle arc segments on a sphere of radius ~1.52
      const r = 1.52;
      const theta1 = Math.random() * Math.PI * 2;
      const phi1 = Math.acos(2 * Math.random() - 1);
      const theta2 = theta1 + (Math.random() - 0.5) * 0.8;
      const phi2 = phi1 + (Math.random() - 0.5) * 0.6;

      pos.push(
        r * Math.sin(phi1) * Math.cos(theta1),
        r * Math.cos(phi1),
        r * Math.sin(phi1) * Math.sin(theta1),
        r * Math.sin(phi2) * Math.cos(theta2),
        r * Math.cos(phi2),
        r * Math.sin(phi2) * Math.sin(theta2)
      );
    }
    return new Float32Array(pos);
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.y = t * 0.08 + s.current * Math.PI * 2;
  });

  return (
    <lineSegments ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={lineCount * 2}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color="#06b6d4"
        transparent
        opacity={0.25}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/* ─── Orbiting particles ─── */
function ParticleRing({ scroll }: { scroll: number }) {
  const ref = useRef<THREE.Points>(null);
  const s = useSmoothScroll(scroll);
  const count = 150;

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = 2.0 + Math.random() * 0.3;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.4;
      pos[i * 3 + 2] = Math.sin(angle) * r;
    }
    return pos;
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.y = t * 0.2 + s.current * Math.PI * 3;
    ref.current.rotation.x = Math.sin(t * 0.12) * 0.1 + s.current * 0.5;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#67e8f9"
        transparent
        opacity={0.7}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/* ─── Earth globe with outer shield shell ─── */
function EarthGlobe({ scroll }: { scroll: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const earthRef = useRef<THREE.Mesh>(null);
  const shieldRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const s = useSmoothScroll(scroll);

  const earthTexture = useTexture("/textures/earth.jpg");

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();

    // Group: scroll-driven fast spin
    groupRef.current.rotation.y = t * 0.08 + s.current * Math.PI * 3;
    groupRef.current.rotation.x =
      Math.sin(t * 0.15) * 0.05 + s.current * Math.PI * 0.8;
    groupRef.current.rotation.z = s.current * Math.PI * 0.3;

    // Scale up slightly on scroll
    const sc = 1 + Math.sin(t * 1.5) * 0.01 + s.current * 0.15;
    groupRef.current.scale.setScalar(sc);

    // Earth rotates independently (slow idle)
    if (earthRef.current) {
      earthRef.current.rotation.y = t * 0.05;
    }

    // Shield shell subtle distortion via slight rotation offset
    if (shieldRef.current) {
      shieldRef.current.rotation.y = t * 0.03;
      shieldRef.current.rotation.x = Math.sin(t * 0.2) * 0.02;
    }

    // Atmosphere glow pulse
    if (atmosphereRef.current) {
      const mat = atmosphereRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.08 + s.current * 0.12 + Math.sin(t * 1.2) * 0.02;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Earth sphere */}
      <Sphere ref={earthRef} args={[1.3, 64, 64]}>
        <meshStandardMaterial
          map={earthTexture}
          roughness={0.6}
          metalness={0.1}
        />
      </Sphere>

      {/* Outer wireframe shield — very low distortion */}
      <Sphere ref={shieldRef} args={[1.55, 64, 64]}>
        <meshStandardMaterial
          color="#06b6d4"
          emissive="#06b6d4"
          emissiveIntensity={0.15}
          roughness={0.2}
          metalness={0.8}
          transparent
          opacity={0.12}
          wireframe
        />
      </Sphere>

      {/* Atmosphere glow */}
      <Sphere ref={atmosphereRef} args={[1.65, 32, 32]}>
        <meshBasicMaterial
          color="#06b6d4"
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
        />
      </Sphere>
    </group>
  );
}

/* ─── Scroll-responsive camera ─── */
function CameraRig({ scroll }: { scroll: number }) {
  const s = useSmoothScroll(scroll, 0.04);
  const { camera } = useThree();

  useFrame(() => {
    camera.position.z = 5.0 - s.current * 0.5;
    camera.position.y = s.current * 0.3;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/* ─── Scene ─── */
function Scene({ scroll }: { scroll: number }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} color="#ffffff" />
      <pointLight position={[-5, -2, 4]} intensity={0.5} color="#0EA5E9" />
      <pointLight position={[3, 4, -3]} intensity={0.3} color="#2563EB" />

      <CameraRig scroll={scroll} />

      <Float
        speed={1.4}
        rotationIntensity={0.15}
        floatIntensity={0.5}
        floatingRange={[-0.1, 0.1]}
      >
        {/* Scale everything down so arcs fit within the canvas */}
        <group scale={0.82}>
          <EarthGlobe scroll={scroll} />
          <NetworkLines scroll={scroll} />
          <ParticleRing scroll={scroll} />
          <ArcsGroup scroll={scroll} />
        </group>
      </Float>
    </>
  );
}

/* ─── Exported component ─── */
export default function ShieldModel() {
  const scroll = useScrollProgress();

  return (
    <div className="shield-model-container">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ background: "transparent" }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <Scene scroll={scroll} />
        </Suspense>
      </Canvas>
    </div>
  );
}
