import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Cosmetic, ShotLane, ShotOutcome } from "../types";
import { TARGETS } from "./physics";

type AimPreview = {
  x: number;
  y: number;
  power: number;
};

type Flight = {
  outcome: ShotOutcome;
  startedAt: number;
};

type TorwandSceneProps = {
  activeLane: ShotLane;
  aimPreview: AimPreview | null;
  flight: Flight | null;
  cosmetic: Cosmetic;
};

const WALL_Z = -6;
const WALL_FRONT_Z = -5.84;
const BALL_START = new THREE.Vector3(0, -2.15, 3.6);

function makeBoardTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  ctx.fillStyle = "#f1f1e8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#d8302f";
  ctx.fillRect(0, 0, 88, canvas.height);
  ctx.fillRect(canvas.width - 88, 0, 88, canvas.height);
  ctx.fillStyle = "#111319";
  ctx.fillRect(88, 0, 12, canvas.height);
  ctx.fillRect(canvas.width - 100, 0, 12, canvas.height);

  ctx.save();
  ctx.globalAlpha = 0.09;
  for (let index = 0; index < 380; index += 1) {
    const size = 2 + Math.random() * 10;
    ctx.fillStyle = Math.random() > 0.62 ? "#111319" : "#d8302f";
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, size, size * 0.45);
  }
  ctx.restore();

  ctx.fillStyle = "#111319";
  ctx.font = "900 76px Arial, sans-serif";
  ctx.fillText("ZDF TORWAND", 142, 135);
  ctx.font = "900 102px Arial, sans-serif";
  ctx.fillText("SPANDAU", 142, 520);
  ctx.font = "700 36px Arial, sans-serif";
  ctx.fillText("KULTURCLASH QUALIFIER", 146, 190);

  ctx.strokeStyle = "#111319";
  ctx.lineWidth = 10;
  ctx.strokeRect(116, 72, canvas.width - 232, canvas.height - 144);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function makeBallTexture(cosmetic: Cosmetic) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  ctx.fillStyle = cosmetic === "fire" ? "#ffcf7a" : cosmetic === "kit" ? "#f4f7ff" : "#f8f8f0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = cosmetic === "kit" ? "#d72638" : "#171a20";
  ctx.lineWidth = 10;

  for (let x = -80; x < canvas.width + 80; x += 128) {
    for (let y = -80; y < canvas.height + 80; y += 128) {
      ctx.beginPath();
      ctx.arc(x, y, 36, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (cosmetic === "fire") {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, "rgba(255, 94, 20, 0.0)");
    gradient.addColorStop(0.7, "rgba(255, 94, 20, 0.35)");
    gradient.addColorStop(1, "rgba(255, 236, 120, 0.6)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (cosmetic === "kit") {
    ctx.fillStyle = "rgba(17, 19, 25, 0.92)";
    ctx.fillRect(0, 82, canvas.width, 28);
    ctx.fillStyle = "#d72638";
    ctx.fillRect(0, 116, canvas.width, 20);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

export function TorwandScene({ activeLane, aimPreview, flight, cosmetic }: TorwandSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneStateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    ball: THREE.Mesh;
    aimMarker: THREE.Mesh;
    aimLine: THREE.Line;
    lowRing: THREE.Mesh;
    highRing: THREE.Mesh;
    lowHole: THREE.Mesh;
    highHole: THREE.Mesh;
    ballMaterial: THREE.MeshStandardMaterial;
    fireLight: THREE.PointLight;
    raf: number;
  } | null>(null);
  const propsRef = useRef({ activeLane, aimPreview, flight, cosmetic });

  useEffect(() => {
    propsRef.current = { activeLane, aimPreview, flight, cosmetic };
  }, [activeLane, aimPreview, flight, cosmetic]);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#101319");
    scene.fog = new THREE.Fog("#101319", 7, 16);

    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
    camera.position.set(0, 0.55, 7.15);
    camera.lookAt(0, -0.15, WALL_Z);

    const ambient = new THREE.HemisphereLight("#e8f2ff", "#25181c", 1.9);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight("#ffffff", 3.2);
    keyLight.position.set(-3, 5, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const redWash = new THREE.PointLight("#d8302f", 2.2, 9);
    redWash.position.set(3.8, 1.8, -1.2);
    scene.add(redWash);

    const blueWash = new THREE.PointLight("#50b7ff", 1.6, 9);
    blueWash.position.set(-4.4, 2.2, -1.6);
    scene.add(blueWash);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 16),
      new THREE.MeshStandardMaterial({
        color: "#20242b",
        roughness: 0.88,
        metalness: 0.08,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.45;
    floor.position.z = -1.5;
    floor.receiveShadow = true;
    scene.add(floor);

    const laneMaterial = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.18,
    });
    for (let index = -2; index <= 2; index += 1) {
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 13), laneMaterial);
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(index * 1.2, -2.43, -1.6);
      scene.add(lane);
    }

    const wallTexture = makeBoardTexture();
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(4.9, 3.05, 0.28),
      new THREE.MeshStandardMaterial({
        map: wallTexture ?? undefined,
        color: wallTexture ? "#ffffff" : "#f1f1e8",
        roughness: 0.7,
        metalness: 0.05,
      }),
    );
    wall.position.set(0, 0, WALL_Z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(5.28, 3.42, 0.08),
      new THREE.MeshStandardMaterial({
        color: "#111319",
        roughness: 0.55,
        metalness: 0.2,
      }),
    );
    frame.position.set(0, 0, WALL_Z - 0.08);
    scene.add(frame);

    const holeMaterial = new THREE.MeshBasicMaterial({ color: "#07080b" });
    const activeHoleMaterial = new THREE.MeshBasicMaterial({ color: "#040506" });
    const lowHole = new THREE.Mesh(new THREE.CircleGeometry(TARGETS.low.radius, 64), holeMaterial.clone());
    lowHole.position.set(TARGETS.low.x, TARGETS.low.y, WALL_FRONT_Z + 0.012);
    scene.add(lowHole);

    const highHole = new THREE.Mesh(new THREE.CircleGeometry(TARGETS.high.radius, 64), activeHoleMaterial.clone());
    highHole.position.set(TARGETS.high.x, TARGETS.high.y, WALL_FRONT_Z + 0.012);
    scene.add(highHole);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: "#f8f0b4" });
    const lowRing = new THREE.Mesh(new THREE.TorusGeometry(TARGETS.low.radius + 0.035, 0.025, 12, 80), ringMaterial.clone());
    lowRing.position.set(TARGETS.low.x, TARGETS.low.y, WALL_FRONT_Z + 0.035);
    scene.add(lowRing);

    const highRing = new THREE.Mesh(new THREE.TorusGeometry(TARGETS.high.radius + 0.035, 0.025, 12, 80), ringMaterial.clone());
    highRing.position.set(TARGETS.high.x, TARGETS.high.y, WALL_FRONT_Z + 0.035);
    scene.add(highRing);

    const aimMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.012, 8, 48),
      new THREE.MeshBasicMaterial({ color: "#7fffd4", transparent: true, opacity: 0 }),
    );
    aimMarker.position.set(0, 0, WALL_FRONT_Z + 0.065);
    scene.add(aimMarker);

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([BALL_START, new THREE.Vector3(0, 0, WALL_FRONT_Z)]);
    const aimLine = new THREE.Line(
      lineGeometry,
      new THREE.LineBasicMaterial({ color: "#7fffd4", transparent: true, opacity: 0 }),
    );
    scene.add(aimLine);

    const ballMaterial = new THREE.MeshStandardMaterial({
      map: makeBallTexture(cosmetic) ?? undefined,
      color: cosmetic === "fire" ? "#ffcf7a" : "#ffffff",
      roughness: 0.34,
      metalness: 0.05,
      emissive: cosmetic === "fire" ? new THREE.Color("#ff4d00") : new THREE.Color("#000000"),
      emissiveIntensity: cosmetic === "fire" ? 0.3 : 0,
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.23, 48, 32), ballMaterial);
    ball.position.copy(BALL_START);
    ball.castShadow = true;
    scene.add(ball);

    const fireLight = new THREE.PointLight("#ff6a1a", 0, 3);
    fireLight.position.copy(BALL_START);
    scene.add(fireLight);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const animate = () => {
      const state = sceneStateRef.current;

      if (!state) {
        return;
      }

      const now = performance.now();
      const current = propsRef.current;
      const activeTarget = TARGETS[current.activeLane];
      const inactiveTarget = TARGETS[current.activeLane === "low" ? "high" : "low"];
      const pulse = 0.55 + Math.sin(now / 155) * 0.45;

      state.lowRing.visible = current.activeLane === "low";
      state.highRing.visible = current.activeLane === "high";
      state.lowRing.scale.setScalar(current.activeLane === "low" ? 1 + pulse * 0.06 : 1);
      state.highRing.scale.setScalar(current.activeLane === "high" ? 1 + pulse * 0.06 : 1);
      state.lowHole.scale.setScalar(current.activeLane === "low" ? 1.04 : 1);
      state.highHole.scale.setScalar(current.activeLane === "high" ? 1.04 : 1);
      state.lowHole.position.set(TARGETS.low.x, TARGETS.low.y, WALL_FRONT_Z + (current.activeLane === "low" ? 0.018 : 0.012));
      state.highHole.position.set(TARGETS.high.x, TARGETS.high.y, WALL_FRONT_Z + (current.activeLane === "high" ? 0.018 : 0.012));

      const ringMaterial = (current.activeLane === "low" ? state.lowRing.material : state.highRing.material) as THREE.MeshBasicMaterial;
      ringMaterial.color.set(current.aimPreview ? "#7fffd4" : "#f8f0b4");

      if (current.aimPreview && !current.flight) {
        const aimMaterial = state.aimMarker.material as THREE.MeshBasicMaterial;
        const lineMaterial = state.aimLine.material as THREE.LineBasicMaterial;
        state.aimMarker.position.set(current.aimPreview.x, current.aimPreview.y, WALL_FRONT_Z + 0.07);
        state.aimMarker.scale.setScalar(0.95 + current.aimPreview.power * 0.35);
        aimMaterial.opacity = 0.9;
        lineMaterial.opacity = 0.55;
        state.aimLine.geometry.setFromPoints([
          BALL_START,
          new THREE.Vector3(current.aimPreview.x, current.aimPreview.y, WALL_FRONT_Z),
        ]);
      } else {
        (state.aimMarker.material as THREE.MeshBasicMaterial).opacity = 0;
        (state.aimLine.material as THREE.LineBasicMaterial).opacity = 0;
      }

      if (current.flight) {
        const progress = Math.min(1, (now - current.flight.startedAt) / 920);
        const eased = 1 - Math.pow(1 - progress, 3);
        const destination = new THREE.Vector3(
          current.flight.outcome.landingX,
          current.flight.outcome.landingY,
          WALL_FRONT_Z + (current.flight.outcome.hit ? -0.15 : 0.18),
        );
        state.ball.position.lerpVectors(BALL_START, destination, eased);
        state.ball.position.y += Math.sin(progress * Math.PI) * 1.05;
        state.ball.rotation.x -= 0.18 + current.flight.outcome.power * 0.08;
        state.ball.rotation.y += 0.11 + current.flight.outcome.curve * 0.08;
      } else {
        state.ball.position.lerp(BALL_START, 0.14);
        state.ball.rotation.x -= 0.01;
        state.ball.rotation.y += 0.008;
      }

      state.fireLight.intensity = current.cosmetic === "fire" ? 1.8 + pulse * 0.6 : 0;
      state.fireLight.position.copy(state.ball.position);

      const targetDistance = Math.hypot(activeTarget.x - inactiveTarget.x, activeTarget.y - inactiveTarget.y);
      camera.position.x = Math.sin(now / 3400) * 0.08 + targetDistance * 0.005;
      camera.lookAt(0, -0.08, WALL_Z);
      renderer.render(scene, camera);
      state.raf = window.requestAnimationFrame(animate);
    };

    sceneStateRef.current = {
      renderer,
      scene,
      camera,
      ball,
      aimMarker,
      aimLine,
      lowRing,
      highRing,
      lowHole,
      highHole,
      ballMaterial,
      fireLight,
      raf: 0,
    };

    resize();
    window.addEventListener("resize", resize);
    animate();

    return () => {
      const state = sceneStateRef.current;
      window.removeEventListener("resize", resize);

      if (state) {
        window.cancelAnimationFrame(state.raf);
        state.renderer.dispose();
        state.scene.traverse((object) => {
          if ("geometry" in object && object.geometry instanceof THREE.BufferGeometry) {
            object.geometry.dispose();
          }

          if ("material" in object) {
            const material = object.material;

            if (Array.isArray(material)) {
              material.forEach((entry) => entry.dispose());
            } else if (material instanceof THREE.Material) {
              material.dispose();
            }
          }
        });
      }

      mount.removeChild(renderer.domElement);
      sceneStateRef.current = null;
    };
  }, []);

  useEffect(() => {
    const state = sceneStateRef.current;

    if (!state) {
      return;
    }

    state.ballMaterial.map?.dispose();
    state.ballMaterial.map = makeBallTexture(cosmetic) ?? null;
    state.ballMaterial.color.set(cosmetic === "fire" ? "#ffcf7a" : "#ffffff");
    state.ballMaterial.emissive.set(cosmetic === "fire" ? "#ff4d00" : "#000000");
    state.ballMaterial.emissiveIntensity = cosmetic === "fire" ? 0.3 : 0;
    state.ballMaterial.needsUpdate = true;
  }, [cosmetic]);

  return <div ref={mountRef} className="torwand-scene" aria-hidden="true" />;
}
