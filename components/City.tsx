"use client";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Component,
  ReactNode,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Graph, connected } from "../lib/model";
import {
  CityLayout,
  VisibleCity,
  colors,
  dependencySegments,
} from "../lib/layout";
import { CameraTarget, cameraPose } from "../lib/city-camera";
import { PlacedLabel } from "../lib/city-labels";
import { LabelOverlay, LabelProjector } from "./CityLabels";
interface Props {
  graph: Graph;
  selected: string;
  mode: "outgoing" | "incoming";
  onSelect: (id: string) => void;
  focus: number;
  layout: CityLayout;
  city: VisibleCity;
  collapsed: ReadonlySet<string>;
  currentFolder: string;
  cameraTarget: CameraTarget;
  onFocusDistrict: (path: string) => void;
  zoom: number;
}
class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function Controls({
  layout,
  focus,
  cameraTarget,
  zoom,
}: Pick<Props, "layout" | "cameraTarget" | "focus" | "zoom">) {
  const { camera, gl, invalidate, events, size } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = false;
    c.maxPolarAngle = Math.PI / 2.1;
    c.minDistance = 3;
    c.maxDistance = Math.max(1000, layout.extent * 20);
    c.addEventListener("change", () => {
      camera.updateMatrixWorld();
      if (gl.domElement.matches(":hover")) events.update?.();
      invalidate();
    });
    controls.current = c;
    return () => {
      c.dispose();
      controls.current = null;
    };
  }, [camera, gl, invalidate, events, layout.extent]);
  useEffect(() => {
    const pose = cameraPose(layout, cameraTarget, size.width / size.height);
    camera.position.set(...pose.position);
    camera.far = pose.far;
    camera.updateProjectionMatrix();
    controls.current?.target.set(...pose.target);
    controls.current?.update();
    invalidate();
  }, [
    layout,
    cameraTarget,
    focus,
    size.width,
    size.height,
    camera,
    invalidate,
  ]);
  const previousZoom = useRef(zoom);
  useEffect(() => {
    const c = controls.current;
    if (c && zoom !== previousZoom.current) {
      camera.position
        .sub(c.target)
        .multiplyScalar(zoom > previousZoom.current ? 0.8 : 1.25)
        .add(c.target);
      c.update();
      invalidate();
    }
    previousZoom.current = zoom;
  }, [zoom, camera, invalidate]);
  return null;
}
function Scene(
  props: Props & {
    overlay: RefObject<HTMLDivElement | null>;
    onLabels: (labels: PlacedLabel[]) => void;
  },
) {
  const layout = props.city;
  const ref = useRef<THREE.InstancedMesh>(null);
  const markers = useRef<THREE.InstancedMesh>(null);
  const metadataBuildings = useMemo(
    () => layout.buildings.filter((b) => b.metadataOnly),
    [layout],
  );
  const { invalidate, gl } = useThree();
  const [hovered, setHovered] = useState("");
  const [hoveredDistrict, setHoveredDistrict] = useState<string | null>(null);
  const outline = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, []);
  useEffect(() => () => outline.dispose(), [outline]);
  useEffect(() => {
    setHovered("");
    setHoveredDistrict(null);
  }, [props.graph, props.city]);
  useEffect(() => {
    gl.domElement.style.cursor =
      hovered || hoveredDistrict !== null ? "pointer" : "grab";
    const leave = () => {
      setHovered("");
      setHoveredDistrict(null);
    };
    gl.domElement.addEventListener("pointerleave", leave);
    return () => {
      gl.domElement.removeEventListener("pointerleave", leave);
      gl.domElement.style.cursor = "";
    };
  }, [gl, hovered, hoveredDistrict]);
  const edges = useMemo(
    () => connected(props.graph, props.selected, props.mode),
    [props.graph, props.selected, props.mode],
  );
  useEffect(() => {
    if (!ref.current) return;
    const obj = new THREE.Object3D();
    const neighbors = new Set(edges.flatMap((e) => [e.from, e.to!]));
    layout.buildings.forEach((b, i) => {
      obj.position.set(b.x, b.baseY + b.height / 2, b.z);
      obj.scale.set(1.15, b.height, 1.15);
      obj.updateMatrix();
      ref.current!.setMatrixAt(i, obj.matrix);
      ref.current!.setColorAt(
        i,
        new THREE.Color(colors[b.category]).multiplyScalar(
          b.id === hovered
            ? 1.15
            : edges.length && b.id !== props.selected && !neighbors.has(b.id)
              ? 0.42
              : 1,
        ),
      );
    });
    ref.current.count = layout.buildings.length;
    if (!layout.buildings.length) gl.domElement.dataset.buildingCount = "0";
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
    ref.current.computeBoundingBox();
    ref.current.userData.ready = true;
    if (markers.current) {
      metadataBuildings.forEach((b, i) => {
        obj.position.set(b.x, b.baseY + b.height + 0.03, b.z);
        obj.rotation.set(-Math.PI / 2, 0, 0);
        obj.scale.set(1, 1, 1);
        obj.updateMatrix();
        markers.current!.setMatrixAt(i, obj.matrix);
      });
      markers.current.count = metadataBuildings.length;
      markers.current.instanceMatrix.needsUpdate = true;
      markers.current.computeBoundingSphere();
    }
    gl.domElement.dataset.metadataBuildingCount = String(
      metadataBuildings.length,
    );
    invalidate();
  }, [
    layout,
    props.selected,
    hovered,
    edges,
    invalidate,
    gl,
    metadataBuildings,
  ]);
  const arrows = useMemo(() => {
    return dependencySegments(edges, layout).flatMap((segment) => {
      const start = new THREE.Vector3(...segment.from),
        end = new THREE.Vector3(...segment.to);
      const vector = end.sub(start);
      if (vector.length() < 0.01) return [];
      const arrow = new THREE.ArrowHelper(
        vector.clone().normalize(),
        start,
        vector.length(),
        0x70ffe0,
        Math.min(0.85, vector.length() * 0.3),
        0.42,
      );
      arrow.userData = { from: segment.edge.from, to: segment.edge.to };
      for (const part of [arrow.line, arrow.cone]) {
        part.renderOrder = 5;
        const material = part.material as THREE.Material;
        material.depthTest = false;
        material.depthWrite = false;
        material.toneMapped = false;
      }
      return [arrow];
    });
  }, [layout, edges]);
  useEffect(
    () => () =>
      arrows.forEach((a) => {
        a.line.geometry.dispose();
        a.cone.geometry.dispose();
        (a.line.material as THREE.Material).dispose();
        (a.cone.material as THREE.Material).dispose();
      }),
    [arrows],
  );
  return (
    <>
      <color attach="background" args={["#101825"]} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[20, 30, 10]} intensity={1.5} />
      <Controls {...props} />
      <LabelProjector
        layout={layout}
        selected={props.selected}
        hovered={hovered}
        hoveredDistrict={hoveredDistrict}
        overlay={props.overlay}
        onLabels={props.onLabels}
        currentFolder={props.currentFolder}
        collapsed={props.collapsed}
      />
      {layout.districts.map((d) => (
        <group key={d.name}>
          <mesh
            position={[d.x, d.elevation - 0.1, d.z]}
            onClick={(e) => {
              e.stopPropagation();
              props.onFocusDistrict(d.name);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredDistrict(d.name);
            }}
            onPointerOut={() => setHoveredDistrict(null)}
          >
            <boxGeometry args={[d.width, 0.2, d.depth]} />
            <meshStandardMaterial
              color={
                hoveredDistrict === d.name
                  ? "#657e9b"
                  : props.collapsed.has(d.name)
                    ? "#526079"
                    : ["#26384b", "#3d5771", "#56748e", "#65849a"][
                        Math.min(d.level, 3)
                      ]
              }
            />
          </mesh>
          <lineSegments
            position={[d.x, d.elevation - 0.1, d.z]}
            scale={[d.width, 0.2, d.depth]}
          >
            <primitive object={outline} attach="geometry" />
            <lineBasicMaterial
              color={d.name === props.currentFolder ? "#dbefff" : "#9db8cd"}
              transparent
              opacity={d.level === 0 ? 0.95 : 0.8}
            />
          </lineSegments>
        </group>
      ))}
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, Math.max(1, layout.buildings.length)]}
        onAfterRender={(renderer) => {
          if (ref.current?.userData.ready) {
            renderer.domElement.dataset.buildingCount = String(
              layout.buildings.length,
            );
            renderer.domElement.dataset.visibleEdges = JSON.stringify(
              arrows.map((a) => a.userData),
            );
            renderer.domElement.dataset.cameraTarget = JSON.stringify(
              props.cameraTarget,
            );
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined)
            props.onSelect(layout.buildings[e.instanceId].id);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) {
            setHovered(layout.buildings[e.instanceId].id);
            setHoveredDistrict(null);
          }
        }}
        onPointerOut={() => setHovered("")}
      >
        <boxGeometry />
        <meshStandardMaterial roughness={0.65} toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={markers}
        args={[undefined, undefined, Math.max(1, metadataBuildings.length)]}
        raycast={() => {}}
      >
        <ringGeometry args={[0.23, 0.34, 4]} />
        <meshBasicMaterial
          color="#ffffff"
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
      {layout.buildings
        .filter((b) => b.id === props.selected || b.id === hovered)
        .map((b) => (
          <lineSegments
            key={b.id}
            position={[b.x, b.baseY + b.height / 2, b.z]}
            scale={[1.22, b.height + 0.08, 1.22]}
            renderOrder={6}
          >
            <primitive object={outline} attach="geometry" />
            <lineBasicMaterial
              color={b.id === props.selected ? "#ffffff" : "#ffd38a"}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </lineSegments>
        ))}
      {arrows.map((a, i) => (
        <primitive key={i} object={a} />
      ))}
    </>
  );
}
export default function City(props: Props) {
  const overlay = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<PlacedLabel[]>([]);
  const fallback = (
    <div className="fallback">
      <h2>City unavailable</h2>
      <p>
        Use the searchable file tree and dependency links to explore every file.
      </p>
    </div>
  );
  return (
    <Boundary fallback={fallback}>
      <div
        className="city-renderer"
        onKeyDown={(e) => {
          if (e.key === "Escape") props.onSelect("");
        }}
      >
        <Canvas
          frameloop="demand"
          camera={{ fov: 45, near: 0.1, far: 1000 }}
          fallback={fallback}
          onPointerMissed={(e) => {
            if (e.type === "click") props.onSelect("");
          }}
        >
          <Scene {...props} overlay={overlay} onLabels={setLabels} />
        </Canvas>
        <LabelOverlay labels={labels} overlay={overlay} />
      </div>
    </Boundary>
  );
}
