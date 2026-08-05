import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { memo, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';
import type { TablePreferences } from '../../lib/tablePreferences';
import { DEALER_SKIN_PALETTES, type DealerRenderProfile, type DealerSceneCue } from './types';

interface DealerSceneProps {
  cue: DealerSceneCue;
  renderProfile: DealerRenderProfile;
  preferences: TablePreferences;
}

interface DealerPalette {
  jacket: THREE.Color;
  shirt: THREE.Color;
  tie: THREE.Color;
  skin: THREE.Color;
  rail: THREE.Color;
  accent: THREE.Color;
}

function DealerCameraRig({ cue, renderProfile }: { cue: DealerSceneCue; renderProfile: DealerRenderProfile }) {
  const { camera } = useThree();

  useFrame(() => {
    const target =
      cue.cameraMode === 'dealer'
        ? new THREE.Vector3(0, 0.72, 5.45)
        : cue.cameraMode === 'board'
          ? new THREE.Vector3(0, 0.16, 5.15)
          : cue.cameraMode === 'winner'
            ? new THREE.Vector3(0, -0.06, 4.95)
            : new THREE.Vector3(0, 0.28, 5.8);

    camera.position.lerp(target, renderProfile.cameraResponsiveness);
    camera.lookAt(0, 0.2, 0);
  });

  return null;
}

function StandardMaterial({
  color,
  roughness = 0.7,
  metalness = 0,
}: {
  color: string | THREE.Color;
  roughness?: number;
  metalness?: number;
}) {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
      }),
    [color, metalness, roughness]
  );

  return <primitive object={material} attach="material" />;
}

function DealerActor({
  cue,
  renderProfile,
  palette,
}: {
  cue: DealerSceneCue;
  renderProfile: DealerRenderProfile;
  palette: DealerPalette;
}) {
  const dealerRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const chestRef = useRef<THREE.Mesh>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    const dealer = dealerRef.current;
    const rightArm = rightArmRef.current;
    const leftArm = leftArmRef.current;
    const chest = chestRef.current;
    const leftEye = leftEyeRef.current;
    const rightEye = rightEyeRef.current;
    if (!dealer || !rightArm || !leftArm || !chest || !leftEye || !rightEye) return;

    const breathe = 1 + Math.sin(time * 1.5) * 0.015;
    const microShift = Math.sin(time * 0.75) * 0.02;
    dealer.position.y = microShift;
    dealer.rotation.y = Math.sin(time * 0.35) * 0.03;
    chest.scale.y = breathe;

    const blink = Math.max(0.1, Math.abs(Math.sin(time * 0.6 + 1.4)) > 0.985 ? 0.12 : 1);
    leftEye.scale.y = THREE.MathUtils.lerp(leftEye.scale.y, blink * renderProfile.blinkScale, 0.22);
    rightEye.scale.y = THREE.MathUtils.lerp(rightEye.scale.y, blink * renderProfile.blinkScale, 0.22);

    let rightTarget = -0.35;
    let leftTarget = 0.28;
    let leftHeight = -0.08;
    let rightHeight = -0.08;

    if (cue.animation === 'shuffle') {
      rightTarget = -0.9 + Math.sin(time * 8) * 0.12;
      leftTarget = 0.9 - Math.cos(time * 8) * 0.12;
      leftHeight = 0.12;
      rightHeight = 0.12;
    } else if (cue.animation === 'deal-hole' || cue.animation === 'deal-flop' || cue.animation === 'deal-turn' || cue.animation === 'deal-river') {
      rightTarget = -1.15 + Math.sin(time * 5) * 0.08;
      leftTarget = 0.45;
      rightHeight = 0.18;
      leftHeight = 0.02;
    } else if (cue.animation === 'collect-chips' || cue.animation === 'push-pot') {
      rightTarget = -0.85;
      leftTarget = 0.85;
      leftHeight = 0.05;
      rightHeight = 0.05;
    } else if (cue.animation === 'wait-action') {
      rightTarget = -0.42;
      leftTarget = 0.38;
      leftHeight = -0.02;
      rightHeight = -0.02;
    }

    rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, rightTarget, 0.1);
    leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, leftTarget, 0.1);
    rightArm.position.y = THREE.MathUtils.lerp(rightArm.position.y, rightHeight, 0.1);
    leftArm.position.y = THREE.MathUtils.lerp(leftArm.position.y, leftHeight, 0.1);
  });

  return (
    <group ref={dealerRef} position={[0, -0.3, 0]}>
      <mesh position={[0, 1.58, 0]}>
        <sphereGeometry args={[0.36, 32, 32]} />
        <StandardMaterial color={palette.skin} roughness={0.65} />
      </mesh>
      <mesh ref={leftEyeRef} position={[-0.1, 1.65, 0.31]}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <StandardMaterial color="#0E1015" />
      </mesh>
      <mesh ref={rightEyeRef} position={[0.1, 1.65, 0.31]}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <StandardMaterial color="#0E1015" />
      </mesh>
      <mesh position={[0, 2.0, -0.03]}>
        <sphereGeometry args={[0.38, 20, 20]} />
        <StandardMaterial color="#2A1F1A" roughness={0.92} />
      </mesh>
      <mesh ref={chestRef} position={[0, 0.84, 0]}>
        <capsuleGeometry args={[0.46, 0.86, 10, 18]} />
        <StandardMaterial color={palette.jacket} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.94, 0.32]}>
        <boxGeometry args={[0.38, 0.7, 0.06]} />
        <StandardMaterial color={palette.shirt} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.87, 0.36]}>
        <boxGeometry args={[0.09, 0.5, 0.04]} />
        <StandardMaterial color={palette.tie} roughness={0.45} metalness={0.1} />
      </mesh>
      <group ref={leftArmRef} position={[-0.55, 0.82, 0]}>
        <mesh rotation={[0, 0, 0.2]}>
          <capsuleGeometry args={[0.09, 0.7, 8, 14]} />
          <StandardMaterial color={palette.jacket} roughness={0.8} />
        </mesh>
        <mesh position={[-0.18, -0.36, 0.12]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <StandardMaterial color={palette.skin} roughness={0.6} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.55, 0.82, 0]}>
        <mesh rotation={[0, 0, -0.2]}>
          <capsuleGeometry args={[0.09, 0.7, 8, 14]} />
          <StandardMaterial color={palette.jacket} roughness={0.8} />
        </mesh>
        <mesh position={[0.18, -0.36, 0.12]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <StandardMaterial color={palette.skin} roughness={0.6} />
        </mesh>
      </group>
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[2.05, 0.22, 0.68]} />
        <StandardMaterial color={palette.rail} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.02, 0.28]}>
        <boxGeometry args={[1.8, 0.06, 0.14]} />
        <StandardMaterial color="#D8D4C9" roughness={0.35} metalness={0.3} />
      </mesh>
    </group>
  );
}

function DealerEnvironment({ renderProfile, palette }: { renderProfile: DealerRenderProfile; palette: DealerPalette }) {
  return (
    <>
      <ambientLight intensity={renderProfile.ambientIntensity + 0.1} color="#F4E4C0" />
      <directionalLight position={[2.6, 4.8, 4.5]} intensity={1.85} color="#FFF3DB" />
      <pointLight position={[-2.8, 2.4, 2.5]} intensity={0.55} color={palette.accent} />
      <pointLight position={[2.4, 2.2, 1.6]} intensity={0.45} color="#EEE4CA" />
      <mesh position={[0, -0.95, -0.45]} rotation={[-0.55, 0, 0]}>
        <planeGeometry args={[6.6, 3.8]} />
        <StandardMaterial color="#149C49" roughness={0.7} metalness={0.08} />
      </mesh>
      <mesh position={[0, 2.75, -1.85]}>
        <boxGeometry args={[4.8, 1.4, 0.16]} />
        <StandardMaterial color="#BAD8EA" roughness={0.92} />
      </mesh>
      <mesh position={[0, 2.1, -1.55]}>
        <boxGeometry args={[4.4, 2.0, 0.22]} />
        <StandardMaterial color="#E8E2D6" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.28, -1.12]}>
        <boxGeometry args={[3.2, 0.16, 0.16]} />
        <StandardMaterial color="#ECE8E0" roughness={0.32} metalness={0.25} />
      </mesh>
      <mesh position={[-1.55, 1.95, -1.1]}>
        <boxGeometry args={[0.24, 1.92, 0.18]} />
        <StandardMaterial color="#D1C7B6" roughness={0.8} />
      </mesh>
      <mesh position={[1.55, 1.95, -1.1]}>
        <boxGeometry args={[0.24, 1.92, 0.18]} />
        <StandardMaterial color="#D1C7B6" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.32, -0.38]}>
        <boxGeometry args={[2.8, 0.18, 0.36]} />
        <StandardMaterial color="#6D3C1F" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.42, -0.16]}>
        <boxGeometry args={[2.3, 0.06, 0.14]} />
        <StandardMaterial color="#D5CEC3" roughness={0.34} metalness={0.28} />
      </mesh>
      <mesh position={[0, 3.18, -1.1]}>
        <boxGeometry args={[2.2, 0.12, 0.12]} />
        <StandardMaterial color="#C59D49" roughness={0.35} metalness={0.28} />
      </mesh>
    </>
  );
}

export const DealerScene = memo(function DealerScene({ cue, renderProfile, preferences }: DealerSceneProps) {
  const palette = useMemo(
    () => ({
      jacket: new THREE.Color(DEALER_SKIN_PALETTES[preferences.dealerSkinId].jacket),
      shirt: new THREE.Color(DEALER_SKIN_PALETTES[preferences.dealerSkinId].shirt),
      tie: new THREE.Color(DEALER_SKIN_PALETTES[preferences.dealerSkinId].tie),
      skin: new THREE.Color(DEALER_SKIN_PALETTES[preferences.dealerSkinId].skin),
      rail: new THREE.Color(DEALER_SKIN_PALETTES[preferences.dealerSkinId].rail),
      accent: new THREE.Color(DEALER_SKIN_PALETTES[preferences.dealerSkinId].accent),
    }),
    [preferences.dealerSkinId]
  );

  return (
    <View style={styles.canvasWrap}>
      <Canvas gl={{ antialias: renderProfile.antialias }} camera={{ position: [0, 0.35, 5.7], fov: 32 }}>
        <DealerEnvironment renderProfile={renderProfile} palette={palette} />
        <DealerCameraRig cue={cue} renderProfile={renderProfile} />
        <DealerActor cue={cue} renderProfile={renderProfile} palette={palette} />
      </Canvas>
    </View>
  );
});

const styles = StyleSheet.create({
  canvasWrap: {
    flex: 1,
    overflow: 'hidden',
  },
});
