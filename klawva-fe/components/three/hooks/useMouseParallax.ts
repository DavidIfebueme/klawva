'use client';

import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export function useMouseParallax() {
  const { camera, mouse } = useThree();

  useFrame(() => {
    // Smoothly lerp camera rotation toward (mouseY * 0.08, mouseX * 0.08, 0)
    const targetX = mouse.y * 0.08;
    const targetY = mouse.x * 0.08;

    const newX = THREE.MathUtils.lerp(camera.rotation.x, targetX, 0.05);
    const newY = THREE.MathUtils.lerp(camera.rotation.y, targetY, 0.05);
    camera.rotation.set(newX, newY, camera.rotation.z);
  });
}
