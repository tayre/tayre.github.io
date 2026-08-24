import * as THREE from 'three';

const WIDTH = 100, HEIGHT = 100;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(35, WIDTH / HEIGHT, 0.1, 10000);
camera.position.z = 70;
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(WIDTH, HEIGHT);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('mainArea').appendChild(renderer.domElement);

const cube = new THREE.Mesh(
    new THREE.BoxGeometry(10, 10, 10),
    new THREE.MeshLambertMaterial({ color: 0x33A31F })
);
scene.add(cube);

const pointLight = new THREE.PointLight(0x00FF00, 1);
pointLight.decay = 0; // modern three uses physical light falloff; keep the old flat look
pointLight.position.set(30, 60, 90);
scene.add(pointLight);

renderer.setAnimationLoop(() => {
    cube.rotation.x += 0.02;
    cube.rotation.y += 0.02;
    renderer.render(scene, camera);
});
