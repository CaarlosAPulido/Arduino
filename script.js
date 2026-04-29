const CONFIG = {
  wsUrl: 'wss://arduino.arroyocreativa.com',
  apiUrl: 'https://arduino.arroyocreativa.com/api/sensors',
  pollInterval: 120,
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const connectionStatusEl = document.getElementById('connectionStatus');
const gameStatusEl = document.getElementById('gameStatus');
const startButton = document.getElementById('startButton');
const resetButton = document.getElementById('resetButton');

const sensorEls = {
  joystickX: document.getElementById('sensorJoystickX'),
  joystickY: document.getElementById('sensorJoystickY'),
  slider: document.getElementById('sensorSlider'),
  btn1: document.getElementById('sensorBtn1'),
  btn2: document.getElementById('sensorBtn2'),
  btn3: document.getElementById('sensorBtn3'),
  btn4: document.getElementById('sensorBtn4'),
  accelZ: document.getElementById('sensorAccelZ'),
  light: document.getElementById('sensorLight'),
  microphone: document.getElementById('sensorMicrophone'),
};

const defaultSensors = {
  joystick: { x: 0, y: 0 },
  slider: 0,
  botones: { btn1: 0, btn2: 0, btn3: 0, btn4: 0 },
  acelerometro: { x: 0, y: 0, z: 0 },
  luz: 0,
  temperatura: 0,
  microfono: 0,
};

let sensors = { ...defaultSensors };
let ws = null;
let pollId = null;
let lastUpdate = Date.now();
let running = false;

const game = {
  width: canvas.width,
  height: canvas.height,
  lastTime: 0,
  state: 'ready',
  player: null,
  enemy: null,
};

class Fighter {
  constructor({ name, x, y, color }) {
    this.name = name;
    this.x = x;
    this.y = y;
    this.width = 48;
    this.height = 90;
    this.color = color;
    this.health = 100;
    this.velocityX = 0;
    this.velocityY = 0;
    this.grounded = true;
    this.action = 'idle';
    this.combo = 0;
    this.hitFrame = 0;
  }

  update(dt) {
    if (this.health <= 0) {
      this.action = 'defeated';
      return;
    }

    if (!this.grounded) {
      this.velocityY += 1800 * dt;
    }

    this.x += this.velocityX * dt;
    this.y += this.velocityY * dt;

    if (this.y >= game.height - 130) {
      this.y = game.height - 130;
      this.velocityY = 0;
      this.grounded = true;
    }

    this.x = Math.max(50, Math.min(game.width - 100, this.x));

    if (this.hitFrame > 0) {
      this.hitFrame -= dt;
      if (this.hitFrame <= 0 && this.action.startsWith('hit')) {
        this.action = 'idle';
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.fillStyle = this.color;
    ctx.shadowColor = '#0009';
    ctx.shadowBlur = 18;
    ctx.fillRect(-this.width / 2, -this.height, this.width, this.height);

    ctx.fillStyle = '#111a2b';
    ctx.fillRect(-this.width / 2, -this.height, this.width, 12);

    if (this.action !== 'idle' && this.action !== 'defeated') {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(-this.width / 2, -this.height, this.width, this.height);
    }

    ctx.restore();
  }
}

function updateSensorDisplay() {
  sensorEls.joystickX.textContent = sensors.joystick.x.toFixed(0);
  sensorEls.joystickY.textContent = sensors.joystick.y.toFixed(0);
  sensorEls.slider.textContent = sensors.slider.toFixed(0);
  sensorEls.btn1.textContent = sensors.botones.btn1;
  sensorEls.btn2.textContent = sensors.botones.btn2;
  sensorEls.btn3.textContent = sensors.botones.btn3;
  sensorEls.btn4.textContent = sensors.botones.btn4;
  sensorEls.accelZ.textContent = sensors.acelerometro.z.toFixed(0);
  sensorEls.light.textContent = sensors.luz.toFixed(0);
  sensorEls.microphone.textContent = sensors.microfono.toFixed(0);
}

function setConnectionStatus(text, color = '#a5b4fc') {
  connectionStatusEl.textContent = text;
  connectionStatusEl.style.color = color;
}

function setGameStatus(text) {
  gameStatusEl.textContent = text;
}

function resetGame() {
  game.player = new Fighter({ name: 'Hero', x: 210, y: game.height - 130, color: '#4f46e5' });
  game.enemy = new Fighter({ name: 'Rival', x: 760, y: game.height - 130, color: '#f97316' });
  game.player.health = 100;
  game.enemy.health = 100;
  game.state = 'ready';
  setGameStatus('Listo para iniciar');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mapSensorsToActions() {
  const input = {
    moveLeft: false,
    moveRight: false,
    jump: false,
    attack: null,
    special: false,
    power: 0,
  };

  if (sensors.joystick.x < -120) input.moveRight = true;
  if (sensors.joystick.x > 120) input.moveLeft = true;
  if (sensors.joystick.y < -220) input.jump = true;

  if (sensors.botones.btn1) input.attack = 'light-punch';
  if (sensors.botones.btn2) input.attack = 'heavy-punch';
  if (sensors.botones.btn3) input.attack = 'light-kick';
  if (sensors.botones.btn4) input.attack = 'heavy-kick';
  if (sensors.acelerometro.z > 320) input.special = true;

  input.power = clamp(sensors.slider / 1023, 0.2, 1);
  return input;
}

function applyPlayerInput(input, dt) {
  if (!game.player || game.player.health <= 0) return;

  if (input.moveLeft) {
    game.player.velocityX = -260;
    game.player.action = 'run';
  } else if (input.moveRight) {
    game.player.velocityX = 260;
    game.player.action = 'run';
  } else {
    game.player.velocityX = 0;
    if (game.player.action === 'run') {
      game.player.action = 'idle';
    }
  }

  if (input.jump && game.player.grounded) {
    game.player.velocityY = -640;
    game.player.grounded = false;
    game.player.action = 'jump';
  }

  if (input.attack) {
    const damage = input.power * (input.attack.includes('heavy') ? 13 : 8);
    game.player.action = input.attack;
    game.player.hitFrame = 0.16;
    attemptHit(game.player, game.enemy, damage);
  }

  if (input.special) {
    game.player.action = 'special';
    game.player.hitFrame = 0.22;
    attemptHit(game.player, game.enemy, 18 * input.power);
  }
}

function attemptHit(attacker, defender, damage) {
  const distance = Math.abs(attacker.x - defender.x);
  if (distance < 140 && defender.health > 0 && attacker.hitFrame > 0) {
    defender.health = clamp(defender.health - damage, 0, 100);
    defender.action = 'hit';
    defender.hitFrame = 0.24;
  }
}

function enemyAi(dt) {
  if (!game.enemy || game.enemy.health <= 0) return;

  const direction = game.player.x < game.enemy.x ? -1 : 1;
  game.enemy.velocityX = direction * 140;
  game.enemy.action = 'run';

  if (Math.abs(game.player.x - game.enemy.x) < 180) {
    game.enemy.velocityX = 0;
    game.enemy.action = 'attack';
    if (Math.random() < 0.01) {
      attemptHit(game.enemy, game.player, 9 + Math.random() * 6);
    }
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, game.height);
  gradient.addColorStop(0, '#121828');
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, game.width, game.height);

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 1; i < 8; i += 1) {
    ctx.fillRect(0, (game.height / 8) * i, game.width, 6);
  }

  ctx.fillStyle = '#334155';
  ctx.fillRect(0, game.height - 80, game.width, 80);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '20px Inter, system-ui, sans-serif';
  ctx.fillText('Arduino Esplora Arena', 30, 40);
}

function drawHealthBars() {
  const barWidth = 360;
  const barHeight = 22;

  ctx.fillStyle = '#334155';
  ctx.fillRect(30, 70, barWidth, barHeight);
  ctx.fillStyle = '#ec4899';
  ctx.fillRect(30, 70, (game.player.health / 100) * barWidth, barHeight);
  ctx.fillStyle = '#f8fafc';
  ctx.fillText('Hero', 30, 66);

  ctx.fillStyle = '#334155';
  ctx.fillRect(game.width - barWidth - 30, 70, barWidth, barHeight);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(game.width - barWidth - 30, 70, (game.enemy.health / 100) * barWidth, barHeight);
  ctx.fillStyle = '#f8fafc';
  ctx.fillText('Rival', game.width - barWidth - 30, 66);
}

function drawInstructions() {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
  ctx.fillRect(28, game.height - 178, 320, 100);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '14px Inter, system-ui, sans-serif';
  ctx.fillText('Controles de Arduino:', 38, game.height - 150);
  ctx.fillText('Joystick: Movimiento y salto', 38, game.height - 128);
  ctx.fillText('Botones 1-4: Golpes y patadas', 38, game.height - 106);
  ctx.fillText('Slider: Potencia de ataque', 38, game.height - 84);
  ctx.fillText('Acelerómetro Z: Golpe especial', 38, game.height - 62);
}

function drawFrame() {
  drawBackground();
  drawHealthBars();
  drawInstructions();
  game.player.draw(ctx);
  game.enemy.draw(ctx);

  if (game.player.health <= 0 || game.enemy.health <= 0) {
    const winner = game.player.health <= 0 ? 'Rival' : 'Hero';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(game.width / 2 - 260, game.height / 2 - 60, 520, 120);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '44px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${winner} gana`, game.width / 2, game.height / 2 + 10);
    ctx.font = '18px Inter, system-ui, sans-serif';
    ctx.fillText('Reinicia el juego para volver a jugar', game.width / 2, game.height / 2 + 45);
    ctx.textAlign = 'start';
  }
}

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - game.lastTime) / 1000, 0.032);
  game.lastTime = timestamp;

  if (running) {
    const input = mapSensorsToActions();
    applyPlayerInput(input, dt);
    enemyAi(dt);
    game.player.update(dt);
    game.enemy.update(dt);
  }

  drawFrame();
  requestAnimationFrame(gameLoop);
}

function initWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }

  try {
    ws = new WebSocket(CONFIG.wsUrl);
    setConnectionStatus('Conectando WebSocket...', '#fcd34d');

    ws.onopen = () => {
      setConnectionStatus('Conectado por WebSocket', '#22c55e');
      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }
    };

    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        mergeSensorData(data);
      } catch (error) {
        console.warn('Mensaje WebSocket inválido', error);
      }
    };

    ws.onerror = () => {
      setConnectionStatus('WebSocket falló, usando REST', '#f97316');
      startPolling();
    };

    ws.onclose = () => {
      setConnectionStatus('Desconectado, reintentando...', '#f97316');
      if (!pollId) {
        startPolling();
      }
      setTimeout(initWebSocket, 3000);
    };
  } catch (error) {
    setConnectionStatus('Imposible abrir WebSocket', '#ef4444');
    startPolling();
  }
}

function startPolling() {
  if (pollId) return;
  pollId = setInterval(() => {
    fetch(CONFIG.apiUrl)
      .then(response => response.json())
      .then(data => mergeSensorData(data))
      .catch(() => setConnectionStatus('No se puede llegar al API REST', '#ef4444'));
  }, CONFIG.pollInterval);
}

function mergeSensorData(data) {
  if (!data) return;
  sensors = {
    joystick: { x: Number(data.joystick?.x ?? sensors.joystick.x), y: Number(data.joystick?.y ?? sensors.joystick.y) },
    slider: Number(data.slider ?? sensors.slider),
    botones: {
      btn1: Number(data.botones?.btn1 ?? sensors.botones.btn1),
      btn2: Number(data.botones?.btn2 ?? sensors.botones.btn2),
      btn3: Number(data.botones?.btn3 ?? sensors.botones.btn3),
      btn4: Number(data.botones?.btn4 ?? sensors.botones.btn4),
    },
    acelerometro: {
      x: Number(data.acelerometro?.x ?? sensors.acelerometro.x),
      y: Number(data.acelerometro?.y ?? sensors.acelerometro.y),
      z: Number(data.acelerometro?.z ?? sensors.acelerometro.z),
    },
    luz: Number(data.luz ?? sensors.luz),
    temperatura: Number(data.temperatura ?? sensors.temperatura),
    microfono: Number(data.microfono ?? sensors.microfono),
  };
  updateSensorDisplay();
}

startButton.addEventListener('click', () => {
  if (!running) {
    running = true;
    game.state = 'running';
    setGameStatus('Juego en curso');
  }
});

resetButton.addEventListener('click', () => {
  resetGame();
  running = false;
  setConnectionStatus('Reiniciado', '#a5b4fc');
});

function init() {
  resetGame();
  updateSensorDisplay();
  setConnectionStatus('Esperando conexión', '#a5b4fc');
  initWebSocket();
  requestAnimationFrame(gameLoop);
}

init();
