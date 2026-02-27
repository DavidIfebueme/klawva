'use client';

import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useTerminationCycle } from './hooks/useTerminationCycle';

interface WorkerEntityProps {
  position: [number, number, number];
  rotationSpeed: [number, number, number];
  phaseOffset: number;
  geometryType: 'icosahedron' | 'octahedron' | 'tetrahedron';
  name: string;
  isActive: boolean;
}

export function WorkerEntity({
  position,
  rotationSpeed,
  phaseOffset,
  geometryType,
  name,
  isActive,
}: WorkerEntityProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireframeRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const particlesRef = useRef<THREE.Points>(null);
  
  const [hovered, setHovered] = useState(false);
  
  const { phase, phaseRef, startTimeRef } = useTerminationCycle(isActive);

  // Geometry
  const geometry = useMemo(() => {
    switch (geometryType) {
      case 'icosahedron': return new THREE.IcosahedronGeometry(1, 1);
      case 'octahedron': return new THREE.OctahedronGeometry(1, 0);
      case 'tetrahedron': return new THREE.TetrahedronGeometry(1.3, 0);
      default: return new THREE.IcosahedronGeometry(1, 1);
    }
  }, [geometryType]);

  // Particles
  const particleCount = 20;
  const [particlePositions, particleVelocities] = useMemo(() => {
    const pseudoRandom = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      // Random direction vector
      const phi = Math.acos(-1 + (2 * i) / particleCount);
      const theta = Math.sqrt(particleCount * Math.PI) * phi;
      
      const vx = Math.cos(theta) * Math.sin(phi);
      const vy = Math.sin(theta) * Math.sin(phi);
      const vz = Math.cos(phi);
      
      // Speed multiplier
      const speed = pseudoRandom(i * 4.4) * 2 + 1;
      
      velocities[i * 3] = vx * speed;
      velocities[i * 3 + 1] = vy * speed;
      velocities[i * 3 + 2] = vz * speed;
      
      // Start at origin relative to entity
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }
    return [positions, velocities];
  }, [particleCount]);

  const particlesGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    return geo;
  }, [particlePositions]);

  useFrame((state) => {
    if (!meshRef.current || !wireframeRef.current || !lightRef.current || !particlesRef.current) return;

    const time = state.clock.elapsedTime;
    const phase = phaseRef.current;
    const now = performance.now();
    const elapsed = (now - startTimeRef.current) / 1000;

    // Base animations (rotation & bobbing)
    meshRef.current.rotation.x += rotationSpeed[0];
    meshRef.current.rotation.y += rotationSpeed[1];
    meshRef.current.rotation.z += rotationSpeed[2];
    
    wireframeRef.current.rotation.copy(meshRef.current.rotation);

    const baseY = position[1];
    const bobOffset = Math.sin(time * 0.8 + phaseOffset) * 0.15;
    
    // Default state values
    let currentScale = hovered ? 1.1 : 1;
    let currentEmissive = Math.sin(time * 1.2 + phaseOffset) * 0.08 + 0.15;
    if (hovered) currentEmissive += 0.2;
    
    let particleOpacity = 0;

    // Termination cycle overrides
    if (phase === 'fragmenting') {
      // Scale 1 -> 0 over 0.6s
      const progress = Math.min(elapsed / 0.6, 1);
      currentScale = THREE.MathUtils.lerp(1, 0, progress);
      
      // Emissive spike then drop
      if (progress < 0.3) {
        currentEmissive = THREE.MathUtils.lerp(currentEmissive, 2.0, progress / 0.3);
      } else {
        currentEmissive = THREE.MathUtils.lerp(2.0, 0, (progress - 0.3) / 0.7);
      }
      
      // Particles fly out
      particleOpacity = 1 - progress;
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = particleVelocities[i * 3] * progress;
        positions[i * 3 + 1] = particleVelocities[i * 3 + 1] * progress;
        positions[i * 3 + 2] = particleVelocities[i * 3 + 2] * progress;
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
      
    } else if (phase === 'void') {
      currentScale = 0;
      currentEmissive = 0;
      
      // Particles continue drifting and fading
      const progress = Math.min(elapsed / 0.3, 1);
      particleOpacity = THREE.MathUtils.lerp(0.4, 0, progress);
      
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = particleVelocities[i * 3] * (1 + progress * 0.5);
        positions[i * 3 + 1] = particleVelocities[i * 3 + 1] * (1 + progress * 0.5);
        positions[i * 3 + 2] = particleVelocities[i * 3 + 2] * (1 + progress * 0.5);
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
      
    } else if (phase === 'reforming') {
      // Scale 0 -> 1 over 0.8s
      const progress = Math.min(elapsed / 0.8, 1);
      // Ease out back
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      currentScale = THREE.MathUtils.lerp(0, 1, easeProgress);
      
      // Emissive build up
      const targetEmissive = Math.sin(time * 1.2 + phaseOffset) * 0.08 + 0.15;
      currentEmissive = THREE.MathUtils.lerp(0, targetEmissive, progress);
      
      // Particles fly back in
      particleOpacity = 1 - progress;
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = particleVelocities[i * 3] * (1.5 * (1 - progress));
        positions[i * 3 + 1] = particleVelocities[i * 3 + 1] * (1.5 * (1 - progress));
        positions[i * 3 + 2] = particleVelocities[i * 3 + 2] * (1.5 * (1 - progress));
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    } else {
      // Reset particles when idle
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount * 3; i++) positions[i] = 0;
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // Apply updates
    meshRef.current.position.set(position[0], baseY + bobOffset, position[2]);
    wireframeRef.current.position.copy(meshRef.current.position);
    lightRef.current.position.copy(meshRef.current.position);
    particlesRef.current.position.copy(meshRef.current.position);

    meshRef.current.scale.setScalar(currentScale);
    wireframeRef.current.scale.setScalar(currentScale);
    
    (meshRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = currentEmissive;
    lightRef.current.intensity = currentEmissive * 2.5; // Scale light with emissive
    
    (particlesRef.current.material as THREE.PointsMaterial).opacity = particleOpacity;
    particlesRef.current.visible = particleOpacity > 0;
  });

  return (
    <group
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          color="#0A0A0A"
          emissive="#E8FF47"
          emissiveIntensity={0.15}
          wireframe={false}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
      
      <mesh ref={wireframeRef} geometry={geometry}>
        <meshBasicMaterial
          color="#E8FF47"
          wireframe={true}
          opacity={0.3}
          transparent={true}
        />
      </mesh>
      
      <pointLight ref={lightRef} color="#E8FF47" intensity={0.4} distance={3} />
      
      <points ref={particlesRef} geometry={particlesGeometry}>
        <pointsMaterial color="#E8FF47" size={0.04} transparent={true} opacity={0} />
      </points>

      {/* Label */}
      {hovered && phase === 'idle' && (
        <Html position={[position[0], position[1] + 1.5, position[2]]} center>
          <div className="bg-klawva-surface/80 backdrop-blur border border-klawva-border px-3 py-1 rounded text-klawva-accent font-mono text-xs uppercase tracking-wider whitespace-nowrap pointer-events-none">
            {name}
          </div>
        </Html>
      )}
    </group>
  );
}
