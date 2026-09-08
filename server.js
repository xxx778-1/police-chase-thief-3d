/**
 * 警察抓小偷 - 实时对战服务端
 * 使用 Express + Socket.io 实现多人在线实时对战
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 游戏状态
const GAME = {
  status: 'waiting', // waiting, playing, ended
  teams: {
    police: { players: {}, score: 0, count: 0 },
    thief: { players: {}, score: 0, count: 0 }
  },
  props: [],
  effects: [],
  timeLeft: 180,
  winner: null,
  mapSize: 120
};

// 道具配置
const PROPS_CONFIG = {
  police: {
    handcuffs: { name: '手铐', cooldown: 8, cost: 0, duration: 3, range: 12 },
    dog: { name: '警犬', cooldown: 15, cost: 50, duration: 8, speed: 18 },
    roadblock: { name: '路障', cooldown: 12, cost: 30, duration: 10, range: 20 }
  },
  thief: {
    smoke: { name: '烟雾弹', cooldown: 10, cost: 0, duration: 5, range: 15 },
    sprint: { name: '疾跑', cooldown: 8, cost: 20, duration: 4, speed: 22 },
    disguise: { name: '伪装', cooldown: 18, cost: 40, duration: 8, range: 0 }
  }
};

// 生成随机位置
function randomPos() {
  return {
    x: (Math.random() - 0.5) * GAME.mapSize * 0.8,
    z: (Math.random() - 0.5) * GAME.mapSize * 0.8
  };
}

// 计算距离
function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}

// 广播游戏状态
function broadcastState() {
  io.emit('gameState', GAME);
}

// 广播弹幕/系统消息
function broadcastMessage(text, type = 'system') {
  io.emit('message', { text, type, time: Date.now() });
}

// 开始游戏
function startGame() {
  if (GAME.status === 'playing') return;
  GAME.status = 'playing';
  GAME.timeLeft = 180;
  GAME.winner = null;
  GAME.teams.police.score = 0;
  GAME.teams.thief.score = 0;
  GAME.props = [];
  GAME.effects = [];
  broadcastMessage('游戏开始！警察抓小偷！', 'system');
  broadcastState();
}

// 结束游戏
function endGame(winner) {
  GAME.status = 'ended';
  GAME.winner = winner;
  broadcastMessage(winner === 'police' ? '警察阵营获胜！' : '小偷阵营获胜！', 'system');
  broadcastState();
}

// 重置游戏
function resetGame() {
  GAME.status = 'waiting';
  GAME.winner = null;
  GAME.timeLeft = 180;
  GAME.teams.police.score = 0;
  GAME.teams.thief.score = 0;
  GAME.props = [];
  GAME.effects = [];
  // 重置玩家状态但保留连接
  Object.values(GAME.teams.police.players).forEach(p => {
    p.alive = true;
    p.caught = false;
    p.score = 0;
    const pos = randomPos();
    p.x = pos.x;
    p.z = pos.z;
  });
  Object.values(GAME.teams.thief.players).forEach(p => {
    p.alive = true;
    p.caught = false;
    p.score = 0;
    const pos = randomPos();
    p.x = pos.x;
    p.z = pos.z;
  });
  broadcastMessage('游戏重置，等待开始...', 'system');
  broadcastState();
}

// 游戏主循环
setInterval(() => {
  if (GAME.status !== 'playing') return;

  GAME.timeLeft -= 0.1;
  if (GAME.timeLeft <= 0) {
    endGame('thief');
    return;
  }

  // 更新效果持续时间
  GAME.effects = GAME.effects.filter(eff => {
    eff.duration -= 0.1;
    return eff.duration > 0;
  });

  // 更新道具
  GAME.props = GAME.props.filter(prop => {
    prop.duration -= 0.1;
    return prop.duration > 0;
  });

  // 抓捕判定
  const polices = Object.values(GAME.teams.police.players).filter(p => p.alive);
  const thieves = Object.values(GAME.teams.thief.players).filter(p => p.alive && !p.caught);

  polices.forEach(police => {
    thieves.forEach(thief => {
      if (distance(police, thief) < 6) {
        thief.caught = true;
        thief.alive = false;
        police.score += 10;
        GAME.teams.police.score += 10;
        GAME.effects.push({
          type: 'catch',
          x: thief.x,
          z: thief.z,
          duration: 1.5,
          team: 'police'
        });
        broadcastMessage(`${police.name} 用手铐抓住了 ${thief.name}！`, 'police');
      }
    });
  });

  // 小偷全部被抓则警察胜利
  if (thieves.length === 0 && Object.keys(GAME.teams.thief.players).length > 0) {
    endGame('police');
  }

  broadcastState();
}, 100);

// Socket.io 连接处理
io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  // 加入阵营
  socket.on('joinTeam', (team) => {
    if (!['police', 'thief'].includes(team)) return;
    
    // 从旧阵营移除
    delete GAME.teams.police.players[socket.id];
    delete GAME.teams.thief.players[socket.id];

    const pos = randomPos();
    GAME.teams[team].players[socket.id] = {
      id: socket.id,
      name: `玩家${socket.id.substr(0, 4)}`,
      team: team,
      x: pos.x,
      z: pos.z,
      score: 0,
      alive: true,
      caught: false,
      cooldowns: {}
    };

    GAME.teams.police.count = Object.keys(GAME.teams.police.players).length;
    GAME.teams.thief.count = Object.keys(GAME.teams.thief.players).length;

    socket.emit('joined', { team, playerId: socket.id });
    broadcastMessage(`一名观众加入了${team === 'police' ? '警察' : '小偷'}阵营`, 'join');
    broadcastState();
  });

  // 玩家移动
  socket.on('move', (data) => {
    const player = GAME.teams.police.players[socket.id] || GAME.teams.thief.players[socket.id];
    if (!player || !player.alive) return;

    const speed = 8;
    const newX = player.x + data.dx * speed * 0.1;
    const newZ = player.z + data.dz * speed * 0.1;

    // 边界限制
    if (Math.abs(newX) < GAME.mapSize / 2) player.x = newX;
    if (Math.abs(newZ) < GAME.mapSize / 2) player.z = newZ;
  });

  // 使用道具
  socket.on('useProp', (data) => {
    const player = GAME.teams.police.players[socket.id] || GAME.teams.thief.players[socket.id];
    if (!player || !player.alive) return;

    const teamProps = PROPS_CONFIG[player.team];
    if (!teamProps[data.propId]) return;

    const prop = teamProps[data.propId];
    const now = Date.now();
    if (player.cooldowns[data.propId] && now < player.cooldowns[data.propId]) {
      socket.emit('errorMessage', `${prop.name} 冷却中`);
      return;
    }

    // 应用道具效果
    player.cooldowns[data.propId] = now + prop.cooldown * 1000;

    GAME.props.push({
      type: data.propId,
      team: player.team,
      x: player.x,
      z: player.z,
      duration: prop.duration,
      range: prop.range || 0,
      owner: socket.id
    });

    GAME.effects.push({
      type: data.propId,
      x: player.x,
      z: player.z,
      duration: prop.duration,
      team: player.team,
      range: prop.range || 0
    });

    broadcastMessage(`${player.name} 使用了 ${prop.name}！`, player.team);
    broadcastState();
  });

  // 设置昵称
  socket.on('setName', (name) => {
    const player = GAME.teams.police.players[socket.id] || GAME.teams.thief.players[socket.id];
    if (player) {
      player.name = name.slice(0, 12);
      broadcastState();
    }
  });

  // 开始/重置游戏
  socket.on('adminStart', () => startGame());
  socket.on('adminReset', () => resetGame());

  // 断开连接
  socket.on('disconnect', () => {
    delete GAME.teams.police.players[socket.id];
    delete GAME.teams.thief.players[socket.id];
    GAME.teams.police.count = Object.keys(GAME.teams.police.players).length;
    GAME.teams.thief.count = Object.keys(GAME.teams.thief.players).length;
    broadcastState();
  });
});

// 首页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`《警察抓小偷》服务器已启动: http://localhost:${PORT}`);
});
