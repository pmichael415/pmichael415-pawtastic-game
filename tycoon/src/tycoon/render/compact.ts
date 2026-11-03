// Fewer draw calls for people and pups (phone readiness plan, task 5): the parts of a model that never move relative
// to their group are merged into ONE mesh with per-vertex colours. Moving parts (a pup's body bob and tail, people's
// arms and legs), the bandana and the soft shadow stay separate, so every animation looks exactly as before.
// Measured: the busy scene drew ~750 calls, 600 of them pup parts (20 a pup). Only this game's 3D view uses this;
// the shared models in src/world/ are unchanged.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const VERTEX_COLOURED = new THREE.MeshLambertMaterial({ vertexColors: true });

/** Merges the opaque, visible meshes under `group` (not inside any `keep` object) into one mesh in `group`'s space. */
export function mergeStill(group: THREE.Object3D, keep: ReadonlySet<THREE.Object3D>): void {
  group.updateMatrixWorld(true);
  const toLocal = group.matrixWorld.clone().invert();
  const parts: THREE.BufferGeometry[] = [];
  const merged: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    for (const child of [...o.children]) {
      if (keep.has(child)) continue;
      const m = child as THREE.Mesh;
      const material = m.material as THREE.MeshLambertMaterial | undefined;
      if (m.isMesh && m.visible && material && !Array.isArray(material) && !material.transparent && material.color) {
        let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, m.matrixWorld));
        const n = g.getAttribute("position").count;
        const colour = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) colour.set([material.color.r, material.color.g, material.color.b], i * 3);
        const clean = new THREE.BufferGeometry();
        clean.setAttribute("position", g.getAttribute("position"));
        if (g.getAttribute("normal")) clean.setAttribute("normal", g.getAttribute("normal"));
        else (g.computeVertexNormals(), clean.setAttribute("normal", g.getAttribute("normal")));
        clean.setAttribute("color", new THREE.BufferAttribute(colour, 3));
        parts.push(clean);
        merged.push(m);
        g = clean;
      }
      visit(child);
    }
  };
  visit(group);
  if (parts.length < 2) return; // nothing to gain
  const geo = mergeGeometries(parts);
  if (!geo) return;
  for (const m of merged) m.removeFromParent();
  const mesh = new THREE.Mesh(geo, VERTEX_COLOURED);
  mesh.userData["mergedGeometry"] = true;
  group.add(mesh);
}

/** Frees the merged geometry when a model leaves the world (the shared part geometries are never freed). */
export function disposeMerged(root: THREE.Object3D): void {
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData["mergedGeometry"]) (o as THREE.Mesh).geometry.dispose();
  });
}
