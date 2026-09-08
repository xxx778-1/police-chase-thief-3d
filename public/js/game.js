/**
 * 警察抓小偷 3D 客户端
 * Three.js + Socket.io 实时对战渲染与交互
 */

// ==================== 全局配置 ====================
const CONFIG = {
  mapSize: 120,
  colors: {
    police: 0x4dabf7,
    thief: 0xff6b6b,
    ground: 0x1a2332,
    grid: 0x2a3a4a,
    building: 0x2d3748,
    road: 0x151b24
  },
  props: {
    police: {
      handcuffs: { name: '手铐', icon: '⛓️', key: '1', desc: '靠近小偷自动抓捕' },
      dog: { name: '警犬', icon: '🐕', key: '2', desc: '召唤警犬追踪小偷' },
      roadblock: { name: '路障', icon: '🚧', key: '3', desc: '放置路障阻挡道路' }
    },
    thief: {
      smoke: { name: '烟雾弹', icon: '💨', key: '1', desc: '释放烟雾遮挡视线' },
      sprint: { name: '疾跑', icon: '⚡', key: '2', desc: '短时间内大幅提升移速' },
      disguise: { name: '伪装', icon: '🎭', key: '3', desc: '伪装成警察混淆视听' }
    }
  }
};

// ==================== 游戏状态 ====================
const state = {
  socket: null,
  team: null,
  playerId: null,
  gameState: null,
  keys: {},
  mouse: { x: 0, y: 0, isDown: false },
  camera: { angle: 0, height: 35, distance: 45 },
  players: {},
  effects: [],
  props: [],
  lastUpdate: Date.now()
};

// ==================== DOM 元素 ====================
const dom = {
  loading: document.getElementById('loading-screen'),
  teamSelect: document.getElementById('team-select'),
  gameUI: document.getElementById('game-ui'),
  joinPolice: document.getElementById('join-police'),
  joinThief: document.getElementById('join-thief'),
  playerName: document.getElementById('player-name'),
  connectionStatus: document.getElementById('connection-status'),
  policeCount: document.getElementById('police-count'),
  thiefCount: document.getElementById('thief-count'),
  policeScore: document.getElementById('police-score'),
  thiefScore: document.getElementById('thief-score'),
  timer: document.getElementById('timer'),
  gameStatus: document.getElementById('game-status'),
  propsList: document.getElementById('props-list'),
  chatMessages: document.getElementById('chat-messages'),
  chatInput: document.getElementById('chat-input'),
  sendChat: document.getElementById('send-chat'),
  winnerBanner: document.getElementById('winner-banner'),
  winnerText: document.getElementById('winner-text'),
  resetGame: document.getElementById('reset-game')
};

// ==================== Three.js 场景 ====================
let scene, camera, renderer, ground, buildings = [];
let playerMeshes = {}, effectMeshes = [], propMeshes = [];

function initThree() {
  const canvas = document.getElementById('game-canvas');
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e17);
  scene.fog = new THREE.Fog(0x0a0e17, 30, 120);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, state.camera.height, state.camera.distance);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 灯光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(50, 80, 50);
  dirLight.castShadow = true;
  dirLight.shadow.camera.left = -70;
  dirLight.shadow.camera.right = 70;
  dirLight.shadow.camera.top = 70;
  dirLight.shadow.camera.bottom = -70;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  scene.add(dirLight);

  // 地面
  const groundGeometry = new THREE.PlaneGeometry(CONFIG.mapSize, CONFIG.mapSize);
  const groundMaterial = new THREE.MeshLambertMaterial({ color: CONFIG.colors.ground });
  ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 网格线
  const gridHelper = new THREE.GridHelper(CONFIG.mapSize, 24, CONFIG.colors.grid, CONFIG.colors.grid);
  gridHelper.position.y = 0.05;
  scene.add(gridHelper);

  // 城市道路
  createRoads();

  // 建筑物
  createBuildings();

  // 边界墙
  createBoundaryWalls();

  window.addEventListener('resize', onWindowResize);
}

function createRoads() {
  const roadMaterial = new THREE.MeshLambertMaterial({ color: CONFIG.colors.road });
  
  // 主干道十字
  const roadH = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.mapSize, 14), roadMaterial);
  roadH.rotation.x = -Math.PI / 2;
  roadH.position.y = 0.06;
  scene.add(roadH);

  const roadV = new THREE.Mesh(new THREE.PlaneGeometry(14, CONFIG.mapSize), roadMaterial);
  roadV.rotation.x = -Math.PI / 2;
  roadV.position.y = 0.06;
  scene.add(roadV);

  // 环形路
  const ringGeo = new THREE.RingGeometry(22, 28, 64);
  const ring = new THREE.Mesh(ringGeo, roadMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  scene.add(ring);
}

function createBuildings() {
  const buildingColors = [0x2d3748, 0x364153, 0x1f2937, 0x374151];
  const positions = [
    [-40, -40], [-20, -45], [25, -40], [45, -25],
    [-45, 20], [-25, 40], [30, 30], [45, 45],
    [-35, -10], [35, -10], [-10, 35], [15, -35]
  ];

  positions.forEach((pos, i) => {
    const width = 8 + Math.random() * 8;
    const depth = 8 + Math.random() * 8;
    const height = 10 + Math.random() * 20;
    const color = buildingColors[i % buildingColors.length];

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshLambertMaterial({ color });
    const building = new THREE.Mesh(geometry, material);
    building.position.set(pos[0], height / 2, pos[1]);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);
    buildings.push(building);

    // 窗户发光
    const windowsGeo = new THREE.BoxGeometry(width + 0.2, height * 0.6, depth + 0.2);
    const windowsMat = new THREE.MeshBasicMaterial({
      color: 0xffd43b,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide
    });
    const windows = new THREE.Mesh(windowsGeo, windowsMat);
    windows.position.copy(building.position);
    scene.add(windows);
  });
}

function createBoundaryWalls() {
  const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x0d1117 });
  const half = CONFIG.mapSize / 2;
  const thickness = 2;
  const height = 6;

  const walls = [
    { pos: [0, height/2, -half - thickness/2], size: [CONFIG.mapSize + 4, height, thickness] },
    { pos: [0, height/2, half + thickness/2], size: [CONFIG.mapSize + 4, height, thickness] },
    { pos: [-half - thickness/2, height/2, 0], size: [thickness, height, CONFIG.mapSize + 4] },
    { pos: [half + thickness/2, height/2, 0], size: [thickness, height, CONFIG.mapSize + 4] }
  ];

  walls.forEach(w => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...w.size),
      wallMaterial
    );
    mesh.position.set(...w.pos);
    scene.add(mesh);
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==================== 玩家渲染 ====================
function createPlayerMesh(player) {
  const group = new THREE.Group();
  const color = player.team === 'police' ? CONFIG.colors.police : CONFIG.colors.thief;

  // 身体（用圆柱 + 半球组合，兼容 Three.js r128）
  const bodyGroup = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  
  // 躯干圆柱
  const torsoGeo = new THREE.CylinderGeometry(1.2, 1.2, 2.5, 16);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.castShadow = true;
  bodyGroup.add(torso);
  
  // 顶部半球
  const topSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    bodyMat
  );
  topSphere.position.y = 1.25;
  topSphere.castShadow = true;
  bodyGroup.add(topSphere);
  
  // 底部半球
  const bottomSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    bodyMat
  );
  bottomSphere.position.y = -1.25;
  bottomSphere.castShadow = true;
  bodyGroup.add(bottomSphere);
  
  bodyGroup.position.y = 2.2;
  group.add(bodyGroup);

  // 头部
  const headGeo = new THREE.SphereGeometry(0.9, 16, 16);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 4.2;
  head.castShadow = true;
  group.add(head);

  // 帽子/头带
  const hatGeo = new THREE.CylinderGeometry(1, 1, 0.5, 16);
  const hatMat = new THREE.MeshLambertMaterial({ color });
  const hat = new THREE.Mesh(hatGeo, hatMat);
  hat.position.y = player.team === 'police' ? 5 : 4.8;
  group.add(hat);

  // 光环（己方玩家）
  if (player.id === state.playerId) {
    const ringGeo = new THREE.RingGeometry(1.5, 2, 32);
    const ringMat = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, 
      transparent: true, 
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    group.add(ring);
  }

  // 名字标签
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.roundRect(0, 0, 256, 64, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px Microsoft YaHei';
  ctx.textAlign = 'center';
  ctx.fillText(player.name, 128, 40);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.y = 6.5;
  sprite.scale.set(8, 2, 1);
  group.add(sprite);

  group.position.set(player.x, 0, player.z);
  scene.add(group);
  playerMeshes[player.id] = group;
}

function updatePlayerMesh(id, player) {
  if (!playerMeshes[id]) {
    createPlayerMesh(player);
  }
  const mesh = playerMeshes[id];
  mesh.position.x = player.x;
  mesh.position.z = player.z;
  mesh.visible = player.alive;

  // 伪装效果
  if (player.team === 'thief' && player.disguiseActive) {
    const bodyGroup = mesh.children[0];
    bodyGroup.children.forEach(child => {
      if (child.material) child.material.color.setHex(CONFIG.colors.police);
    });
  }
}

function removePlayerMesh(id) {
  if (playerMeshes[id]) {
    scene.remove(playerMeshes[id]);
    delete playerMeshes[id];
  }
}

// ==================== 道具特效渲染 ====================
function createEffect(effect) {
  let mesh;
  const color = effect.team === 'police' ? CONFIG.colors.police : CONFIG.colors.thief;

  switch (effect.type) {
    case 'smoke':
      const smokeGeo = new THREE.SphereGeometry(effect.range || 8, 16, 16);
      const smokeMat = new THREE.MeshBasicMaterial({ 
        color: 0x888888, 
        transparent: true, 
        opacity: 0.4 
      });
      mesh = new THREE.Mesh(smokeGeo, smokeMat);
      mesh.position.set(effect.x, 3, effect.z);
      break;
    
    case 'roadblock':
      const blockGeo = new THREE.BoxGeometry(4, 3, 1.5);
      const blockMat = new THREE.MeshLambertMaterial({ color: 0xff9500 });
      mesh = new THREE.Mesh(blockGeo, blockMat);
      mesh.position.set(effect.x, 1.5, effect.z);
      break;
    
    case 'catch':
      const catchGeo = new THREE.RingGeometry(0.5, 3, 32);
      const catchMat = new THREE.MeshBasicMaterial({ 
        color: 0xffd43b, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      mesh = new THREE.Mesh(catchGeo, catchMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(effect.x, 0.2, effect.z);
      break;
    
    case 'sprint':
      const sprintGeo = new THREE.RingGeometry(1, 2, 16);
      const sprintMat = new THREE.MeshBasicMaterial({ 
        color: color, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6
      });
      mesh = new THREE.Mesh(sprintGeo, sprintMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(effect.x, 0.1, effect.z);
      break;
    
    default:
      const defaultGeo = new THREE.SphereGeometry(2, 16, 16);
      const defaultMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
      mesh = new THREE.Mesh(defaultGeo, defaultMat);
      mesh.position.set(effect.x, 2, effect.z);
  }

  scene.add(mesh);
  effectMeshes.push({ mesh, created: Date.now(), duration: effect.duration * 1000 });
}

function updateEffects() {
  const now = Date.now();
  effectMeshes = effectMeshes.filter(item => {
    const elapsed = now - item.created;
    if (elapsed > item.duration) {
      scene.remove(item.mesh);
      return false;
    }
    // 淡出效果
    const progress = elapsed / item.duration;
    if (item.mesh.material.opacity !== undefined) {
      item.mesh.material.opacity *= 0.98;
    }
    // 抓捕光环扩散
    if (item.mesh.geometry.type === 'RingGeometry') {
      item.mesh.scale.multiplyScalar(1.02);
    }
    return true;
  });
}

// ==================== 摄像机跟随 ====================
function updateCamera() {
  if (!state.playerId || !state.gameState) return;
  
  const player = state.gameState.teams.police.players[state.playerId] || 
                 state.gameState.teams.thief.players[state.playerId];
  if (!player) return;

  const targetX = player.x;
  const targetZ = player.z;
  const angle = state.camera.angle;
  const dist = state.camera.distance;
  const height = state.camera.height;

  camera.position.x = targetX + Math.sin(angle) * dist;
  camera.position.z = targetZ + Math.cos(angle) * dist;
  camera.position.y = height;
  camera.lookAt(targetX, 0, targetZ);
}

// ==================== 输入处理 ====================
function setupInputs() {
  document.addEventListener('keydown', (e) => {
    state.keys[e.key.toLowerCase()] = true;
    
    // 数字键使用道具
    if (['1', '2', '3'].includes(e.key)) {
      usePropByIndex(parseInt(e.key) - 1);
    }
  });

  document.addEventListener('keyup', (e) => {
    state.keys[e.key.toLowerCase()] = false;
  });

  // 鼠标控制视角
  document.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'CANVAS') {
      state.mouse.isDown = true;
      state.mouse.x = e.clientX;
    }
  });

  document.addEventListener('mouseup', () => {
    state.mouse.isDown = false;
  });

  document.addEventListener('mousemove', (e) => {
    if (state.mouse.isDown) {
      const deltaX = e.clientX - state.mouse.x;
      state.camera.angle -= deltaX * 0.01;
      state.mouse.x = e.clientX;
    }
  });

  // 滚轮调整距离
  document.addEventListener('wheel', (e) => {
    state.camera.distance = Math.max(20, Math.min(80, state.camera.distance + e.deltaY * 0.05));
  });
}

function getMovementInput() {
  let dx = 0, dz = 0;
  if (state.keys['w'] || state.keys['arrowup']) dz -= 1;
  if (state.keys['s'] || state.keys['arrowdown']) dz += 1;
  if (state.keys['a'] || state.keys['arrowleft']) dx -= 1;
  if (state.keys['d'] || state.keys['arrowright']) dx += 1;
  
  // 归一化
  if (dx !== 0 || dz !== 0) {
    const len = Math.sqrt(dx * dx + dz * dz);
    dx /= len;
    dz /= len;
  }
  return { dx, dz };
}

// ==================== 道具系统 ====================
function renderProps() {
  if (!state.team) return;
  const teamProps = CONFIG.props[state.team];
  dom.propsList.innerHTML = '';
  
  Object.entries(teamProps).forEach(([id, prop], index) => {
    const div = document.createElement('div');
    div.className = 'prop-item';
    div.dataset.prop = id;
    div.innerHTML = `
      <div class="prop-icon">${prop.icon}</div>
      <div class="prop-info">
        <div class="prop-name">${prop.name}</div>
        <div class="prop-key">按 ${prop.key}</div>
      </div>
      <div class="prop-cooldown" id="cd-${id}"></div>
    `;
    div.addEventListener('click', () => useProp(id));
    dom.propsList.appendChild(div);
  });
}

function usePropByIndex(index) {
  if (!state.team) return;
  const propIds = Object.keys(CONFIG.props[state.team]);
  if (propIds[index]) useProp(propIds[index]);
}

function useProp(propId) {
  if (!state.socket || !state.team) return;
  state.socket.emit('useProp', { propId });
}

function updateCooldowns() {
  if (!state.gameState || !state.playerId) return;
  const player = state.gameState.teams.police.players[state.playerId] || 
                 state.gameState.teams.thief.players[state.playerId];
  if (!player || !player.cooldowns) return;

  const now = Date.now();
  Object.entries(player.cooldowns).forEach(([propId, endTime]) => {
    const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
    const cdEl = document.getElementById(`cd-${propId}`);
    const itemEl = document.querySelector(`.prop-item[data-prop="${propId}"]`);
    if (cdEl) {
      cdEl.textContent = remaining > 0 ? `${remaining}s` : '';
    }
    if (itemEl) {
      itemEl.classList.toggle('cooldown', remaining > 0);
    }
  });
}

// ==================== 弹幕系统 ====================
function addChatMessage(text, type = 'normal') {
  const div = document.createElement('div');
  div.className = `chat-message ${type}`;
  div.textContent = text;
  dom.chatMessages.appendChild(div);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  
  // 限制消息数量
  while (dom.chatMessages.children.length > 50) {
    dom.chatMessages.removeChild(dom.chatMessages.firstChild);
  }
}

function setupChat() {
  dom.sendChat.addEventListener('click', sendChatMessage);
  dom.chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
}

function sendChatMessage() {
  const text = dom.chatInput.value.trim();
  if (!text) return;
  
  addChatMessage(`我: ${text}`, state.team || 'normal');
  if (state.socket) {
    state.socket.emit('chatMessage', { text });
  }
  dom.chatInput.value = '';
}

// 模拟观众弹幕
function simulateViewerMessages() {
  const messages = [
    '警察加油！', '小偷快跑！', '这局精彩', '666666',
    ' joined police', ' joined thief', '手铐抓住他！',
    '烟雾弹掩护！', '警犬来了快跑', '太刺激了'
  ];
  const names = ['观众甲', '弹幕君', '路人王', '吃瓜群众', '热心网友'];
  
  setInterval(() => {
    if (Math.random() > 0.7) {
      const name = names[Math.floor(Math.random() * names.length)];
      const msg = messages[Math.floor(Math.random() * messages.length)];
      addChatMessage(`${name}: ${msg}`, 'normal');
    }
  }, 3000);
}

// ==================== 网络连接 ====================
function initSocket() {
  // 如果是本地文件协议，直接启用离线模式
  if (window.location.protocol === 'file:') {
    console.log('本地文件模式，直接启用离线演示');
    setTimeout(initOfflineMode, 500);
    return;
  }

  // 尝试连接 Socket.io 服务器，如果失败则启用离线模式
  try {
    state.socket = io({
      transports: ['websocket', 'polling'],
      timeout: 3000,
      reconnectionAttempts: 2
    });
    
    state.socket.on('connect', () => {
      dom.connectionStatus.textContent = '已连接服务器';
      dom.connectionStatus.className = 'status connected';
    });

    state.socket.on('connect_error', () => {
      dom.connectionStatus.textContent = '服务器连接失败，将启用本地演示模式';
      dom.connectionStatus.className = 'status error';
      setTimeout(initOfflineMode, 1500);
    });

    state.socket.on('joined', (data) => {
      state.team = data.team;
      state.playerId = data.playerId;
      showGameUI();
      renderProps();
    });

    state.socket.on('gameState', (gameState) => {
      state.gameState = gameState;
      updateUI(gameState);
      updatePlayers(gameState);
      updateEffectsFromState(gameState);
    });

    state.socket.on('message', (msg) => {
      addChatMessage(msg.text, msg.type);
    });

    state.socket.on('errorMessage', (text) => {
      addChatMessage(text, 'system');
    });

    // 3秒内没连上则自动离线
    setTimeout(() => {
      if (!state.socket || !state.socket.connected) {
        if (!state.offlineMode) {
          dom.connectionStatus.textContent = '连接超时，启用本地演示模式';
          dom.connectionStatus.className = 'status error';
          initOfflineMode();
        }
      }
    }, 3500);

  } catch (e) {
    console.warn('Socket.io 不可用，启用离线模式');
    initOfflineMode();
  }
}

function updateUI(gameState) {
  dom.policeCount.textContent = gameState.teams.police.count;
  dom.thiefCount.textContent = gameState.teams.thief.count;
  dom.policeScore.textContent = gameState.teams.police.score;
  dom.thiefScore.textContent = gameState.teams.thief.score;

  const minutes = Math.floor(gameState.timeLeft / 60);
  const seconds = Math.floor(gameState.timeLeft % 60);
  dom.timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const statusMap = {
    waiting: '等待开始',
    playing: '游戏进行中',
    ended: '游戏结束'
  };
  dom.gameStatus.textContent = statusMap[gameState.status] || '等待中';

  if (gameState.status === 'ended' && gameState.winner) {
    dom.winnerText.textContent = gameState.winner === 'police' ? '警察阵营获胜！' : '小偷阵营获胜！';
    dom.winnerBanner.classList.remove('hidden');
  } else {
    dom.winnerBanner.classList.add('hidden');
  }
}

function updatePlayers(gameState) {
  const allPlayers = {
    ...gameState.teams.police.players,
    ...gameState.teams.thief.players
  };

  // 新增/更新
  Object.entries(allPlayers).forEach(([id, player]) => {
    updatePlayerMesh(id, player);
  });

  // 删除离线玩家
  Object.keys(playerMeshes).forEach(id => {
    if (!allPlayers[id]) {
      removePlayerMesh(id);
    }
  });
}

function updateEffectsFromState(gameState) {
  // 服务端推送的效果
  if (gameState.effects) {
    gameState.effects.forEach(effect => {
      // 避免重复创建：基于位置和时间简单去重
      const exists = effectMeshes.some(item => 
        Math.abs(item.mesh.position.x - effect.x) < 0.1 &&
        Math.abs(item.mesh.position.z - effect.z) < 0.1 &&
        (Date.now() - item.created) < 500
      );
      if (!exists) {
        createEffect(effect);
      }
    });
  }
}

// ==================== 离线演示模式 ====================
function initOfflineMode() {
  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }
  
  state.offlineMode = true;
  dom.connectionStatus.textContent = '本地演示模式（可单机体验）';
  dom.connectionStatus.className = 'status error';
  
  // 创建本地游戏状态
  state.gameState = {
    status: 'playing',
    timeLeft: 180,
    teams: {
      police: { count: 1, score: 0, players: {} },
      thief: { count: 1, score: 0, players: {} }
    },
    effects: [],
    props: []
  };

  // 默认加入警察
  joinTeam('police');
  
  // 添加 AI 玩家
  addAIPlayers();
  
  // 本地游戏循环
  setInterval(localGameLoop, 100);
}

function addAIPlayers() {
  const teams = ['police', 'thief'];
  teams.forEach(team => {
    for (let i = 0; i < 4; i++) {
      const id = `ai_${team}_${i}`;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 40;
      state.gameState.teams[team].players[id] = {
        id,
        name: `${team === 'police' ? '警察' : '小偷'}${i + 1}`,
        team,
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        alive: true,
        caught: false,
        score: 0,
        ai: true,
        cooldowns: {}
      };
    }
  });
}

function localGameLoop() {
  if (!state.offlineMode || !state.gameState) return;
  if (state.gameState.status !== 'playing') return;

  state.gameState.timeLeft -= 0.1;
  if (state.gameState.timeLeft <= 0) {
    state.gameState.status = 'ended';
    state.gameState.winner = 'thief';
  }

  // AI 移动
  Object.values(state.gameState.teams.police.players).forEach(p => {
    if (p.ai && p.alive) moveAI(p, 'police');
  });
  Object.values(state.gameState.teams.thief.players).forEach(p => {
    if (p.ai && p.alive) moveAI(p, 'thief');
  });

  // 本地玩家移动
  if (state.playerId) {
    const player = state.gameState.teams.police.players[state.playerId] || 
                   state.gameState.teams.thief.players[state.playerId];
    if (player && player.alive) {
      const { dx, dz } = getMovementInput();
      const speed = state.keys['2'] && state.team === 'thief' ? 18 : 10;
      player.x += dx * speed * 0.1;
      player.z += dz * speed * 0.1;
      // 边界
      player.x = Math.max(-CONFIG.mapSize/2, Math.min(CONFIG.mapSize/2, player.x));
      player.z = Math.max(-CONFIG.mapSize/2, Math.min(CONFIG.mapSize/2, player.z));
    }
  }

  // 抓捕判定
  const polices = Object.values(state.gameState.teams.police.players).filter(p => p.alive);
  const thieves = Object.values(state.gameState.teams.thief.players).filter(p => p.alive && !p.caught);

  polices.forEach(police => {
    thieves.forEach(thief => {
      const dist = Math.sqrt((police.x - thief.x)**2 + (police.z - thief.z)**2);
      if (dist < 5) {
        thief.caught = true;
        thief.alive = false;
        addChatMessage(`${police.name} 抓住了 ${thief.name}！`, 'police');
        state.gameState.effects.push({
          type: 'catch',
          x: thief.x,
          z: thief.z,
          duration: 1.5,
          team: 'police'
        });
      }
    });
  });

  if (thieves.length === 0) {
    state.gameState.status = 'ended';
    state.gameState.winner = 'police';
  }

  // 更新计数
  state.gameState.teams.police.count = Object.keys(state.gameState.teams.police.players).length;
  state.gameState.teams.thief.count = Object.keys(state.gameState.teams.thief.players).length;

  updateUI(state.gameState);
  updatePlayers(state.gameState);
  updateEffectsFromState(state.gameState);
}

function moveAI(player, team) {
  // 简单 AI：随机移动 + 追踪/躲避
  const target = findNearestTarget(player, team);
  let dx = 0, dz = 0;
  
  if (target) {
    const dist = Math.sqrt((player.x - target.x)**2 + (player.z - target.z)**2);
    if (team === 'police' && dist > 3) {
      dx = target.x - player.x;
      dz = target.z - player.z;
    } else if (team === 'thief' && dist < 20) {
      dx = player.x - target.x;
      dz = player.z - target.z;
    }
  }
  
  if (dx === 0 && dz === 0) {
    dx = Math.random() - 0.5;
    dz = Math.random() - 0.5;
  }
  
  const len = Math.sqrt(dx*dx + dz*dz) || 1;
  const speed = team === 'police' ? 9 : 8;
  player.x += (dx / len) * speed * 0.1;
  player.z += (dz / len) * speed * 0.1;
  
  player.x = Math.max(-CONFIG.mapSize/2 + 2, Math.min(CONFIG.mapSize/2 - 2, player.x));
  player.z = Math.max(-CONFIG.mapSize/2 + 2, Math.min(CONFIG.mapSize/2 - 2, player.z));
}

function findNearestTarget(player, team) {
  const enemyTeam = team === 'police' ? 'thief' : 'police';
  const enemies = Object.values(state.gameState.teams[enemyTeam].players).filter(p => p.alive && !p.caught);
  if (enemies.length === 0) return null;
  
  return enemies.reduce((nearest, p) => {
    const dist = (player.x - p.x)**2 + (player.z - p.z)**2;
    const nearestDist = (player.x - nearest.x)**2 + (player.z - nearest.z)**2;
    return dist < nearestDist ? p : nearest;
  });
}

// ==================== UI 事件 ====================
function showTeamSelect() {
  dom.loading.classList.add('hidden');
  dom.teamSelect.classList.remove('hidden');
}

function showGameUI() {
  dom.teamSelect.classList.add('hidden');
  dom.gameUI.classList.remove('hidden');
}

function joinTeam(team) {
  state.team = team;
  const name = dom.playerName.value.trim() || `玩家${Math.floor(Math.random() * 1000)}`;
  
  if (state.socket) {
    state.socket.emit('setName', name);
    state.socket.emit('joinTeam', team);
  } else {
    // 离线模式
    const id = 'local_player';
    state.playerId = id;
    state.gameState.teams[team].players[id] = {
      id,
      name,
      team,
      x: 0,
      z: 0,
      alive: true,
      caught: false,
      score: 0,
      cooldowns: {}
    };
    showGameUI();
    renderProps();
  }
}

function setupUIEvents() {
  dom.joinPolice.addEventListener('click', () => joinTeam('police'));
  dom.joinThief.addEventListener('click', () => joinTeam('thief'));
  
  dom.resetGame.addEventListener('click', () => {
    if (state.socket) {
      state.socket.emit('adminReset');
    } else {
      // 离线重置
      state.gameState.status = 'playing';
      state.gameState.timeLeft = 180;
      state.gameState.winner = null;
      Object.values(state.gameState.teams.police.players).forEach(p => {
        p.alive = true; p.caught = false;
        p.x = (Math.random() - 0.5) * 60;
        p.z = (Math.random() - 0.5) * 60;
      });
      Object.values(state.gameState.teams.thief.players).forEach(p => {
        p.alive = true; p.caught = false;
        p.x = (Math.random() - 0.5) * 60;
        p.z = (Math.random() - 0.5) * 60;
      });
    }
  });
}

// ==================== 主动画循环 ====================
function animate() {
  requestAnimationFrame(animate);
  
  const now = Date.now();
  const delta = (now - state.lastUpdate) / 1000;
  state.lastUpdate = now;

  // 发送移动输入
  if (state.socket && state.playerId && state.gameState && state.gameState.status === 'playing') {
    const { dx, dz } = getMovementInput();
    if (dx !== 0 || dz !== 0) {
      state.socket.emit('move', { dx, dz });
    }
  }

  updateCamera();
  updateEffects();
  updateCooldowns();
  renderer.render(scene, camera);
}

// ==================== 初始化 ====================
function init() {
  initThree();
  setupInputs();
  setupChat();
  setupUIEvents();
  initSocket();
  simulateViewerMessages();
  
  // 3秒后显示阵营选择
  setTimeout(() => {
    showTeamSelect();
  }, 1500);
  
  animate();
}

// 启动游戏
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
