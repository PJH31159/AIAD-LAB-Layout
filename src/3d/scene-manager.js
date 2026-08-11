(function () {
  'use strict';

  class SceneManager {
    constructor(host) {
      this.host = host;
      this.ready = false;
      this.wallMode = 'all';
      if (!window.THREE) return;
      const T = window.THREE;
      this.scene = new T.Scene();
      this.scene.background = new T.Color(0xf1f3f6);
      this.camera = new T.PerspectiveCamera(42, 1, 1, 10000);
      this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      host.appendChild(this.renderer.domElement);
      this.controls = T.OrbitControls ? new T.OrbitControls(this.camera, this.renderer.domElement) : null;
      if (this.controls) { this.controls.enableDamping = true; this.controls.dampingFactor = .08; }
      this.scene.add(new T.HemisphereLight(0xffffff, 0x536176, 1.25));
      const sun = new T.DirectionalLight(0xffffff, .8); sun.position.set(-500, 900, 400); sun.castShadow = true; this.scene.add(sun);
      this.content = new T.Group(); this.scene.add(this.content);
      this.ready = true;
      this.animate = this.animate.bind(this); this.animate();
    }

    clear() {
      while (this.content.children.length) {
        const node = this.content.children.pop();
        node.traverse(o => { o.geometry?.dispose(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material?.dispose(); });
      }
    }

    material(color, options = {}) {
      return new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .03, ...options });
    }

    box(w, h, d, color, x, y, z, options = {}) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1, w), Math.max(1, h), Math.max(1, d)), this.material(color, options));
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; this.content.add(mesh); return mesh;
    }

    lineWall(a, b, height, thickness, material, isFront = false) {
      const length = Math.hypot(b.x - a.x, b.y - a.y), mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), material.clone());
      mesh.position.set((a.x + b.x) / 2, height / 2, (a.y + b.y) / 2);
      mesh.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x); mesh.userData.wall = true; mesh.userData.front = isFront;
      mesh.castShadow = true; mesh.receiveShadow = true; this.content.add(mesh);
    }

    build(state) {
      if (!this.ready) return false;
      this.clear();
      const vertices = state.roomBoundary.vertices, wallHeight = state.settings.wallHeight || 270;
      const shape = new THREE.Shape(); vertices.forEach((p, i) => i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)); shape.closePath();
      const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.material(0xe7e2d8)); floor.rotation.x = Math.PI / 2; floor.receiveShadow = true; this.content.add(floor);
      const wallMat = this.material(0xf7f8fa, { transparent: true });
      vertices.forEach((a, i) => { const b = vertices[(i + 1) % vertices.length]; this.lineWall(a, b, wallHeight, state.settings.wallThickness || 12, wallMat, Math.max(a.y, b.y) > 790); });
      (state.walls || []).forEach(w => this.lineWall(w.start || w.startPoint, w.end || w.endPoint, wallHeight, w.thickness || 12, wallMat));
      (state.glassWalls || []).forEach(w => this.lineWall(w.start, w.end, wallHeight, w.thickness || 10, this.material(0x75d7e9, { transparent: true, opacity: .28 })));
      (state.doors || []).forEach(d => { const panel = this.box(d.width, 210, 6, 0x76a98f, d.x + d.width / 2, 105, d.y, { transparent: true, opacity: .45 }); panel.rotation.y = -(d.rotation || 0) * Math.PI / 180; });
      (state.windows || []).forEach(w => { const a=w.start||w.startPoint,b=w.end||w.endPoint,length=Math.hypot(b.x-a.x,b.y-a.y),mesh=this.box(length, 110, 5, 0x76cde7, (a.x+b.x)/2, 150, (a.y+b.y)/2, {transparent:true,opacity:.3});mesh.rotation.y=-Math.atan2(b.y-a.y,b.x-a.x); });
      (state.structures || []).filter(o => !['outlet', 'lan'].includes(o.type)).forEach(o => this.box(o.w || o.width, o.type === 'column' ? wallHeight : 80, o.h || o.height, o.type === 'distribution' ? 0xd7a946 : 0x657086, o.x, o.type === 'column' ? wallHeight / 2 : 40, o.y));
      (state.furniture || []).forEach(o => this.addFurniture(o));
      this.applyWallMode(this.wallMode); this.fit(); this.resize(); return true;
    }

    addFurniture(o) {
      const color = new THREE.Color(o.color || '#8793a7'), x = o.x, z = o.y, w = o.w, d = o.h, group = new THREE.Group();
      const add = (bw, bh, bd, bx, by, bz, c = color) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), this.material(c)); m.position.set(bx, by, bz); m.castShadow = true; m.receiveShadow = true; group.add(m); };
      if (['desk','existingDesk'].includes(o.type)||/Table/.test(o.type)) { add(w, 7, d, 0, 72, 0); [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz]) => add(5, 70, 5, sx*(w/2-8), 35, sz*(d/2-8), 0x596273)); }
      else if (o.type==='chair'||/Chair/.test(o.type)) { add(w*.72, 8, d*.72, 0, 43, 0); add(w*.72, 55, 7, 0, 73, d*.33, color); }
      else if (o.type === 'sofa') { add(w, 40, d, 0, 25, 0); add(w, 55, 16, 0, 65, d/2-8); }
      else if (o.type === 'monitor') { add(w, 90, 8, 0, 100, 0, 0x263344); add(35, 12, 28, 0, 50, 0, 0x596273); }
      else if (o.type === 'whiteboard') { add(w, 100, 7, 0, 110, 0, 0xf4f6f8); }
      else { add(w, o.type === 'fridge' ? 180 : 90, d, 0, o.type === 'fridge' ? 90 : 45, 0); }
      group.position.set(x, 0, z); group.rotation.y = -(o.rotation || 0) * Math.PI / 180; this.content.add(group);
    }

    applyWallMode(mode) {
      this.wallMode = mode;
      this.content.traverse(o => { if (!o.userData.wall) return; o.visible = !(mode === 'front-hidden' && o.userData.front); o.material.transparent = mode !== 'all'; o.material.opacity = mode === 'transparent' ? .18 : mode === 'ghost' ? .42 : 1; o.material.depthWrite = o.material.opacity > .5; });
    }

    setCamera(mode) {
      if (!this.ready) return; const target = new THREE.Vector3(580, 0, 400);
      if (mode === 'top') this.camera.position.set(580, 1600, 400);
      else if (mode === 'front') this.camera.position.set(580, 280, 1500);
      else this.camera.position.set(1350, 1050, 1350);
      this.camera.up.set(0, 1, 0); this.camera.lookAt(target); if (this.controls) { this.controls.target.copy(target); this.controls.update(); }
    }

    fit() { this.setCamera('perspective'); }
    resize() { if (!this.ready || !this.host.clientWidth) return; this.camera.aspect = this.host.clientWidth / this.host.clientHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(this.host.clientWidth, this.host.clientHeight, false); }
    animate() { if (!this.ready) return; requestAnimationFrame(this.animate); this.controls?.update(); this.renderer.render(this.scene, this.camera); }
  }

  window.AIADSceneManager = SceneManager;
})();
