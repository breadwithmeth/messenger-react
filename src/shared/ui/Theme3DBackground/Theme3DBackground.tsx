import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';

type BlockTheme = 'minecraft' | 'minecraft-nether';

type BlockItem = {
  position: [number, number, number];
  size: number;
  color: string;
};

type FloatingBlocksProps = {
  blocks: BlockItem[];
  speed: number;
  wobble: number;
  reducedMotion: boolean;
};

type Theme3DBackgroundProps = {
  theme: BlockTheme;
};

function buildBlocks(theme: BlockTheme): BlockItem[] {
  const colors =
    theme === 'minecraft'
      ? ['#78c850', '#59a53b', '#9f7c4d', '#7c6a5a', '#bcc4c9']
      : ['#ff7b2b', '#ff3b25', '#7b1c1c', '#4f1010', '#a84a2e'];

  const count = 30;
  const result: BlockItem[] = [];

  for (let i = 0; i < count; i += 1) {
    const ring = (i % 10) + 1;
    const layer = Math.floor(i / 10);
    const angle = (i * 0.82) % (Math.PI * 2);
    const radius = 4.2 + ring * 0.6 + layer * 0.2;

    result.push({
      position: [
        Math.cos(angle) * radius,
        (layer - 1) * 2.4 + Math.sin(angle * 2) * 0.7,
        -8 - ring * 0.65,
      ],
      size: 0.55 + ((i * 13) % 5) * 0.14,
      color: colors[i % colors.length],
    });
  }

  return result;
}

function FloatingBlocks({ blocks, speed, wobble, reducedMotion }: FloatingBlocksProps) {
  const groupRef = useRef<Group | null>(null);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (reducedMotion) {
      groupRef.current.rotation.y = 0.12;
      groupRef.current.rotation.x = -0.06;
      return;
    }

    groupRef.current.rotation.y += delta * speed;
    groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.35) * wobble;
  });

  return (
    <group ref={groupRef}>
      {blocks.map((block, index) => (
        <mesh key={`${index}-${block.color}`} position={block.position}>
          <boxGeometry args={[block.size, block.size, block.size]} />
          <meshStandardMaterial color={block.color} roughness={0.78} metalness={0.06} />
        </mesh>
      ))}
    </group>
  );
}

export function Theme3DBackground({ theme }: Theme3DBackgroundProps) {
  const blocks = useMemo(() => buildBlocks(theme), [theme]);
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fogColor = theme === 'minecraft' ? '#92d4ff' : '#2a0a0a';
  const ambientIntensity = theme === 'minecraft' ? 0.72 : 0.45;
  const mainLightColor = theme === 'minecraft' ? '#fff4d6' : '#ff8450';

  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0.2, 10], fov: 46 }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={[fogColor]} />
      <fog attach="fog" args={[fogColor, 8, 28]} />

      <ambientLight intensity={ambientIntensity} />
      <directionalLight position={[8, 9, 3]} intensity={0.85} color={mainLightColor} />
      <directionalLight position={[-5, 3, -2]} intensity={theme === 'minecraft' ? 0.25 : 0.35} color="#ff4e2a" />

      <FloatingBlocks
        blocks={blocks}
        speed={theme === 'minecraft' ? 0.11 : 0.17}
        wobble={theme === 'minecraft' ? 0.06 : 0.08}
        reducedMotion={reducedMotion}
      />
    </Canvas>
  );
}
