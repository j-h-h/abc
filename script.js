const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('overlay');
const speedLabel = document.getElementById('speed');
const distanceLabel = document.getElementById('distance');
const bestLabel = document.getElementById('best');

const state = {
  running: false,
  speed: 0,
  targetSpeed: 6,
  distance: 0,
  best: 0,
  laneOffset: 0,
  time: 0,
  turbo: false,
  shake: 0,
  cars: [],
  stars: [],
  sparks: [],
};

const controls = {
  left: false,
  right: false,
  up: false,
  down: false,
  turbo: false,
};

const road = {
  width: 520,
  center: canvas.width / 2,
  curve: 0,
};

const player = {
  x: canvas.width / 2,
  y: canvas.height * 0.78,
  width: 60,
  height: 110,
  speed: 0,
};

const gradientSky = ctx.createLinearGradient(0, 0, 0, canvas.height);
gradientSky.addColorStop(0, '#0f1230');
gradientSky.addColorStop(0.5, '#090c1f');
gradientSky.addColorStop(1, '#05050f');

const neonPalette = ['#53f6ff', '#ff4f9a', '#ffe36e', '#7bff83'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const randomBetween = (min, max) => Math.random() * (max - min) + min;

const createStars = () => {
  state.stars = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: randomBetween(0.5, 1.8),
    twinkle: randomBetween(0.4, 1),
  }));
};

const resizeCanvas = () => {
  const { width, height } = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  road.center = width / 2;
  road.width = Math.min(520, width * 0.62);
  player.x = width / 2;
  player.y = height * 0.78;
  createStars();
};

const spawnCar = () => {
  const lane = Math.floor(Math.random() * 3) - 1;
  const roadOffset = lane * 120 + randomBetween(-20, 20);
  const color = neonPalette[Math.floor(Math.random() * neonPalette.length)];
  state.cars.push({
    x: road.center + roadOffset,
    y: -120,
    width: 56,
    height: 100,
    color,
    speed: randomBetween(2.5, 4.5),
  });
};

const spawnSparks = () => {
  for (let i = 0; i < 14; i += 1) {
    state.sparks.push({
      x: player.x + randomBetween(-25, 25),
      y: player.y + randomBetween(20, 50),
      vx: randomBetween(-1.5, 1.5),
      vy: randomBetween(2, 5),
      life: randomBetween(20, 40),
      color: neonPalette[Math.floor(Math.random() * neonPalette.length)],
    });
  }
};

const resetGame = () => {
  state.running = false;
  state.speed = 0;
  state.distance = 0;
  state.laneOffset = 0;
  state.time = 0;
  state.cars = [];
  state.sparks = [];
  player.x = canvas.getBoundingClientRect().width / 2;
  player.y = canvas.getBoundingClientRect().height * 0.78;
  road.curve = 0;
  overlay.classList.remove('hidden');
  overlay.querySelector('h2').textContent = 'לחץ כדי להתחיל';
};

const drawSky = () => {
  ctx.fillStyle = gradientSky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.fillStyle = '#1f2755';
  ctx.beginPath();
  ctx.arc(canvas.width * 0.8, canvas.height * 0.2, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  state.stars.forEach((star) => {
    ctx.globalAlpha = star.twinkle + Math.sin(state.time * 0.01 + star.x) * 0.25;
    ctx.fillStyle = '#d7e4ff';
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
};

const drawRoad = () => {
  const roadLeft = road.center - road.width / 2 + road.curve * 80;
  const roadRight = road.center + road.width / 2 + road.curve * 80;

  ctx.save();
  ctx.fillStyle = '#0c0f1f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(roadLeft, canvas.height);
  ctx.quadraticCurveTo(
    road.center + road.curve * 200,
    canvas.height * 0.45,
    road.center,
    canvas.height * 0.1
  );
  ctx.lineTo(road.center, canvas.height * 0.1);
  ctx.quadraticCurveTo(
    road.center + road.curve * 200,
    canvas.height * 0.45,
    roadRight,
    canvas.height
  );
  ctx.closePath();
  ctx.fillStyle = '#1a1f30';
  ctx.fill();

  ctx.strokeStyle = 'rgba(83, 246, 255, 0.5)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#f0f4ff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(roadLeft + 20, canvas.height);
  ctx.quadraticCurveTo(
    road.center + road.curve * 200,
    canvas.height * 0.45,
    road.center - 40,
    canvas.height * 0.1
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(roadRight - 20, canvas.height);
  ctx.quadraticCurveTo(
    road.center + road.curve * 200,
    canvas.height * 0.45,
    road.center + 40,
    canvas.height * 0.1
  );
  ctx.stroke();
  ctx.restore();

  ctx.save();
  const stripeCount = 14;
  for (let i = 0; i < stripeCount; i += 1) {
    const progress = ((i / stripeCount) + state.time * 0.01) % 1;
    const y = canvas.height * (1 - progress);
    const width = 10 + progress * 8;
    const height = 40 + progress * 40;
    const center = road.center + road.curve * 120 * (1 - progress);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.6;
    ctx.fillRect(center - width / 2, y - height / 2, width, height);
  }
  ctx.restore();
};

const drawCity = () => {
  ctx.save();
  ctx.fillStyle = '#0f1428';
  ctx.fillRect(0, canvas.height * 0.18, canvas.width, canvas.height * 0.32);

  for (let i = 0; i < 26; i += 1) {
    const buildingWidth = randomBetween(40, 90);
    const buildingHeight = randomBetween(60, 200);
    const x = i * 40 + (state.time * 0.3) % 40;
    const y = canvas.height * 0.5 - buildingHeight;
    ctx.fillStyle = '#111b3a';
    ctx.fillRect(x, y, buildingWidth, buildingHeight);

    ctx.fillStyle = neonPalette[i % neonPalette.length];
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x + 8, y + 20, 6, 16);
    ctx.fillRect(x + 22, y + 40, 6, 12);
  }

  ctx.restore();
};

const drawRoundedRect = (x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const drawCar = (x, y, width, height, color, highlight = '#ffffff') => {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#0c0f1f';
  ctx.fillRect(-width / 2, -height / 2, width, height);

  ctx.fillStyle = color;
  drawRoundedRect(-width / 2 + 6, -height / 2 + 8, width - 12, height - 16, 8);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(-width / 4, -height / 2 + 16, width / 2, height / 6);

  ctx.fillStyle = highlight;
  ctx.fillRect(-width / 2 + 8, height / 2 - 18, width - 16, 8);
  ctx.restore();
};

const drawPlayer = () => {
  const glow = ctx.createRadialGradient(player.x, player.y, 10, player.x, player.y, 80);
  glow.addColorStop(0, 'rgba(83, 246, 255, 0.6)');
  glow.addColorStop(1, 'rgba(83, 246, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 80, 0, Math.PI * 2);
  ctx.fill();

  drawCar(player.x, player.y, player.width, player.height, '#f53c8b');

  if (state.turbo) {
    ctx.save();
    ctx.fillStyle = 'rgba(83, 246, 255, 0.7)';
    ctx.beginPath();
    ctx.moveTo(player.x - 20, player.y + 60);
    ctx.lineTo(player.x, player.y + 120);
    ctx.lineTo(player.x + 20, player.y + 60);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
};

const updateCars = () => {
  state.cars.forEach((car) => {
    car.y += state.speed + car.speed;
  });

  state.cars = state.cars.filter((car) => car.y < canvas.height + 120);

  if (state.time % 70 === 0) {
    spawnCar();
  }
};

const updateSparks = () => {
  state.sparks.forEach((spark) => {
    spark.x += spark.vx;
    spark.y += spark.vy;
    spark.life -= 1;
  });
  state.sparks = state.sparks.filter((spark) => spark.life > 0);
};

const drawSparks = () => {
  state.sparks.forEach((spark) => {
    ctx.save();
    ctx.globalAlpha = spark.life / 40;
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
};

const handleCollision = () => {
  const playerRect = {
    left: player.x - player.width / 2,
    right: player.x + player.width / 2,
    top: player.y - player.height / 2,
    bottom: player.y + player.height / 2,
  };

  const collision = state.cars.some((car) => {
    const carRect = {
      left: car.x - car.width / 2,
      right: car.x + car.width / 2,
      top: car.y - car.height / 2,
      bottom: car.y + car.height / 2,
    };

    return (
      playerRect.left < carRect.right &&
      playerRect.right > carRect.left &&
      playerRect.top < carRect.bottom &&
      playerRect.bottom > carRect.top
    );
  });

  if (collision) {
    state.running = false;
    state.shake = 20;
    spawnSparks();
    overlay.classList.remove('hidden');
    overlay.querySelector('h2').textContent = 'התנגשות! לחץ כדי לנסות שוב';
    if (state.distance > state.best) {
      state.best = Math.floor(state.distance);
    }
  }
};

const updatePlayer = () => {
  const lateral = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  const vertical = (controls.down ? 1 : 0) - (controls.up ? 1 : 0);

  const maxOffset = road.width * 0.35;
  state.laneOffset = clamp(state.laneOffset + lateral * 6, -maxOffset, maxOffset);
  player.x = road.center + state.laneOffset + road.curve * 50;

  const verticalSpeed = vertical * 2;
  player.y = clamp(player.y + verticalSpeed, canvas.height * 0.6, canvas.height * 0.85);

  state.turbo = controls.turbo;
  state.targetSpeed = state.turbo ? 11 : 7;
};

const updateHUD = () => {
  speedLabel.textContent = Math.round(state.speed * 20);
  distanceLabel.textContent = Math.floor(state.distance);
  bestLabel.textContent = Math.floor(state.best);
};

const update = () => {
  if (!state.running) return;

  state.time += 1;
  state.speed += (state.targetSpeed - state.speed) * 0.03;
  state.distance += state.speed * 0.2;

  road.curve = Math.sin(state.time * 0.01) * 0.5;

  updatePlayer();
  updateCars();
  updateSparks();
  handleCollision();
  updateHUD();
};

const drawIdlePrompt = () => {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = '24px Rubik, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('לחץ כדי להתחיל', canvas.width / 2, canvas.height * 0.55);
  ctx.restore();
};

const draw = () => {
  ctx.save();
  if (state.shake > 0) {
    state.shake -= 1;
    ctx.translate(randomBetween(-5, 5), randomBetween(-5, 5));
  }

  drawSky();
  drawCity();
  drawRoad();
  state.cars.forEach((car) => drawCar(car.x, car.y, car.width, car.height, car.color));
  drawPlayer();
  drawSparks();
  if (!state.running) {
    drawIdlePrompt();
  }

  ctx.restore();
};

const loop = () => {
  update();
  draw();
  requestAnimationFrame(loop);
};

const startGame = () => {
  if (state.running) return;
  state.running = true;
  overlay.classList.add('hidden');
};

const handleKey = (event, pressed) => {
  switch (event.key) {
    case 'ArrowLeft':
      controls.left = pressed;
      break;
    case 'ArrowRight':
      controls.right = pressed;
      break;
    case 'ArrowUp':
      controls.up = pressed;
      break;
    case 'ArrowDown':
      controls.down = pressed;
      break;
    case 'Shift':
      controls.turbo = pressed;
      break;
    case 'r':
    case 'R':
      if (!pressed) {
        resetGame();
      }
      break;
    default:
      break;
  }
};

canvas.addEventListener('click', startGame);
window.addEventListener('keydown', (event) => handleKey(event, true));
window.addEventListener('keyup', (event) => handleKey(event, false));
window.addEventListener('resize', resizeCanvas);

resizeCanvas();
resetGame();
loop();
