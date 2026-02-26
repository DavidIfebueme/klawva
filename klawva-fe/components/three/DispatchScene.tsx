'use client';

import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr, AdaptiveEvents } from '@react-three/drei';
import * as THREE from 'three';
import { WorkerEntity } from './WorkerEntity';
import { useMouseParallax } from './hooks/useMouseParallax';

function Scene() {
  useMouseParallax();

  // Background particles
  const particleCount = 200;
  const particlesGeometry = useMemo(() => {
    const pseudoRandom = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      // Random position in a sphere of radius 15
      const r = 15 * Math.cbrt(pseudoRandom(i * 1.1));
      const theta = pseudoRandom(i * 2.2) * 2 * Math.PI;
      const phi = Math.acos(2 * pseudoRandom(i * 3.3) - 1);
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [particleCount]);

  return (
    <>
      <ambientLight intensity={0.1} />
      <directionalLight position={[5, 5, 5]} intensity={0.3} color="#FFFFFF" />
      <directionalLight position={[-5, -5, -3]} intensity={0.15} color="#E8FF47" />
      
      <fog attach="fog" args={['#0A0A0A', 8, 20]} />

      <points geometry={particlesGeometry}>
        <pointsMaterial color="#2A2A2A" size={0.015} />
      </points>

      <WorkerEntity
        name="Scrapper"
        geometryType="icosahedron"
        position={[-2.2, 0.4, 0]}
        rotationSpeed={[0.003, 0.005, 0]}
        phaseOffset={0}
        isActive={true}
      />
      <WorkerEntity
        name="Vendor"
        geometryType="octahedron"
        position={[0, -0.8, 0.5]}
        rotationSpeed={[0.004, -0.003, 0.002]}
        phaseOffset={2.1}
        isActive={true}
      />
      <WorkerEntity
        name="Researcher"
        geometryType="tetrahedron"
        position={[2.2, 0.6, -0.3]}
        rotationSpeed={[-0.002, 0.004, 0.003]}
        phaseOffset={4.2}
        isActive={true}
      />
    </>
  );
}

export default function DispatchScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 60 }}
      dpr={[1, 1.5]}
      performance={{ min: 0.5 }}
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={['#0A0A0A']} />
      <AdaptiveDpr pixelated />
      <AdaptiveEvents />
      <Scene />
    </Canvas>
  );
}
