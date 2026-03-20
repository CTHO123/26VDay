import * as THREE from 'three';

// --- Configuration ---
const CONFIG = {
    moveSpeed: 0.15,
    interactionDist: 3.5,
    cameraOffset: new THREE.Vector3(0, 5, 8),
    cameraLookAtOffset: new THREE.Vector3(0, 1, 0)
};

// --- State ---
const state = {
    keys: {},
    isChestOpen: false,
    canInteract: false,
    facingRight: true
};

// --- Setup Scene with Error Handling ---
let scene, camera, renderer, avatarGroup, avatarSprite, chestGroup, lidPivot;

try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222); // Dark grey initially to show canvas is active

    // Debug Cube - To verify scene is rendering at all
    const debugGeo = new THREE.BoxGeometry(1, 1, 1);
    const debugMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
    const debugMesh = new THREE.Mesh(debugGeo, debugMat);
    debugMesh.position.set(-5, 1, 0); // To the left
    scene.add(debugMesh);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // --- Environment ---
    // Ground
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7c59 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Background (Cyclorama) - with Fallback
    const bgGeo = new THREE.CylinderGeometry(40, 40, 30, 32, 1, true);
    bgGeo.scale(-1, 1, 1);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide }); // Default Sky Blue
    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    bgMesh.position.y = 5;
    bgMesh.rotation.y = -Math.PI / 2;
    scene.add(bgMesh);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
        './assets/background.jpg',
        (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            bgMat.map = tex;
            bgMat.needsUpdate = true;
        },
        undefined,
        (err) => console.warn("BG Texture failed (likely CORS), keeping color fallback.")
    );

    // --- Avatar (2.5D Billboard) ---
    avatarGroup = new THREE.Group();
    scene.add(avatarGroup);

    // Fallback Red Box for Avatar
    const fallbackAvatar = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 1, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    fallbackAvatar.position.y = 0.5;
    fallbackAvatar.visible = false;
    avatarGroup.add(fallbackAvatar);

    const avatarMat = new THREE.SpriteMaterial({ color: 0xffffff }); // White base
    avatarSprite = new THREE.Sprite(avatarMat);
    avatarSprite.scale.set(2, 2, 1);
    avatarSprite.position.y = 1;

    textureLoader.load(
        './assets/avatar.png',
        (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            avatarMat.map = tex;
            avatarMat.needsUpdate = true;
        },
        undefined,
        (err) => {
            console.warn("Avatar texture failed, using fallback.");
            avatarSprite.visible = false;
            fallbackAvatar.visible = true;
        }
    );
    avatarGroup.add(avatarSprite);

    // Shadow
    const shadowMesh = new THREE.Mesh(
        new THREE.CircleGeometry(0.6, 32),
        new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.3, transparent: true })
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.05;
    avatarGroup.add(shadowMesh);

    // --- Treasure Chest ---
    chestGroup = new THREE.Group();
    chestGroup.position.set(5, 0, -5);
    scene.add(chestGroup);

    const chestMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    const chestBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 1), chestMat);
    chestBase.position.y = 0.4;
    chestBase.castShadow = true;
    chestGroup.add(chestBase);

    lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.8, -0.5);
    chestGroup.add(lidPivot);

    const lid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.75, 1.5, 16, 1, false, 0, Math.PI),
        chestMat
    );
    lid.rotation.z = Math.PI / 2;
    lid.position.set(0, 0, 0.5);
    lid.castShadow = true;
    lidPivot.add(lid);

    // Start Loop
    animate();

} catch (e) {
    console.error("Three.js Init Error:", e);
    const log = document.getElementById('debug-log');
    if (log) {
        log.style.display = 'block';
        log.innerHTML += `<div>CRITICAL ERROR: ${e.message}</div>`;
    }
}

// --- UI Logic ---
const uiPrompt = document.getElementById('interaction-prompt');
const uiModal = document.getElementById('modal');
document.getElementById('close-modal').addEventListener('click', () => uiModal.classList.add('hidden'));

// --- Input ---
window.addEventListener('keydown', (e) => {
    state.keys[e.code] = true;
    if (e.code === 'Space' && state.canInteract && !state.isChestOpen) openChest();
});
window.addEventListener('keyup', (e) => state.keys[e.code] = false);

window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

// --- Logic ---
function openChest() {
    state.isChestOpen = true;
    const startRot = 0;
    const endRot = -Math.PI / 2;
    const duration = 1000;
    const startTime = performance.now();

    function animateOpen(time) {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        lidPivot.rotation.x = startRot + (endRot - startRot) * easeOutBack(progress);
        if (progress < 1) requestAnimationFrame(animateOpen);
        else uiModal.classList.remove('hidden');
    }
    requestAnimationFrame(animateOpen);
}

function easeOutBack(x) {
    const c1 = 1.70158;
    return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function animate() {
    requestAnimationFrame(animate);

    // Movement
    if (!avatarGroup) return;

    let dx = 0, dz = 0;
    if (state.keys['KeyW'] || state.keys['ArrowUp']) dz -= 1;
    if (state.keys['KeyS'] || state.keys['ArrowDown']) dz += 1;
    if (state.keys['KeyA'] || state.keys['ArrowLeft']) dx -= 1;
    if (state.keys['KeyD'] || state.keys['ArrowRight']) dx += 1;

    if (dx !== 0 || dz !== 0) {
        const factor = CONFIG.moveSpeed / Math.sqrt(dx * dx + dz * dz || 1);
        dx *= factor;
        dz *= factor;
        avatarGroup.position.x += dx;
        avatarGroup.position.z += dz;

        if (dx < 0 && state.facingRight) {
            avatarSprite.scale.x = -Math.abs(avatarSprite.scale.x);
            state.facingRight = false;
        } else if (dx > 0 && !state.facingRight) {
            avatarSprite.scale.x = Math.abs(avatarSprite.scale.x);
            state.facingRight = true;
        }
    }

    // Camera Follow
    const targetPos = avatarGroup.position.clone().add(CONFIG.cameraOffset);
    camera.position.lerp(targetPos, 0.1);
    camera.lookAt(avatarGroup.position.clone().add(CONFIG.cameraLookAtOffset));

    // Interaction Check
    const dist = avatarGroup.position.distanceTo(chestGroup.position);
    if (dist < CONFIG.interactionDist && !state.isChestOpen) {
        state.canInteract = true;
        uiPrompt.classList.remove('hidden');
    } else {
        state.canInteract = false;
        uiPrompt.classList.add('hidden');
    }

    renderer.render(scene, camera);
}
