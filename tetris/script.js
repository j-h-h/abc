const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 24;
const LINES_PER_LEVEL = 10;

const COLORS = {
  I: "#00f0f0",
  J: "#0000f0",
  L: "#f0a000",
  O: "#f0f000",
  S: "#00f000",
  T: "#a000f0",
  Z: "#f00000",
  ghost: "rgba(255, 255, 255, 0.2)",
};

const TETROMINOS = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
};

class Piece {
  constructor(shape) {
    this.shape = shape;
    this.matrix = TETROMINOS[shape].map((row) => [...row]);
    this.pos = { x: Math.floor(COLS / 2) - Math.ceil(this.matrix[0].length / 2), y: -1 };
  }

  rotate(direction = 1) {
    const size = this.matrix.length;
    const rotated = Array.from({ length: size }, () => Array(size).fill(0));

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (direction > 0) {
          rotated[x][size - 1 - y] = this.matrix[y][x];
        } else {
          rotated[size - 1 - x][y] = this.matrix[y][x];
        }
      }
    }
    this.matrix = rotated;
  }

  clone() {
    const copy = new Piece(this.shape);
    copy.matrix = this.matrix.map((row) => [...row]);
    copy.pos = { ...this.pos };
    return copy;
  }
}

class Board {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.grid = this.createGrid();
  }

  createGrid() {
    return Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
  }

  reset() {
    this.grid = this.createGrid();
  }

  insideWalls(x) {
    return x >= 0 && x < this.cols;
  }

  aboveFloor(y) {
    return y < this.rows;
  }

  isEmpty(x, y) {
    return this.grid[y] && this.grid[y][x] === null;
  }

  place(piece) {
    piece.matrix.forEach((row, dy) => {
      row.forEach((value, dx) => {
        if (value) {
          const x = piece.pos.x + dx;
          const y = piece.pos.y + dy;
          if (y >= 0) {
            this.grid[y][x] = piece.shape;
          }
        }
      });
    });
  }

  clearLines() {
    const newGrid = this.grid.filter((row) => row.some((cell) => cell === null));
    const cleared = this.rows - newGrid.length;
    while (newGrid.length < this.rows) {
      newGrid.unshift(Array(this.cols).fill(null));
    }
    this.grid = newGrid;
    return cleared;
  }
}

class TetrisGame {
  constructor() {
    this.board = new Board(ROWS, COLS);
    this.ctx = document.getElementById("board").getContext("2d");
    this.nextCtx = document.getElementById("next").getContext("2d");
    this.scoreEl = document.getElementById("score");
    this.linesEl = document.getElementById("lines");
    this.levelEl = document.getElementById("level");
    this.overlay = document.getElementById("overlay");
    this.overlayTitle = document.getElementById("overlay-title");
    this.overlayMessage = document.getElementById("overlay-message");
    this.startBtn = document.getElementById("start");
    this.resumeBtn = document.getElementById("resume");

    this.dropCounter = 0;
    this.dropInterval = 1000;
    this.lastTime = 0;
    this.paused = false;
    this.gameOver = false;

    this.score = 0;
    this.lines = 0;
    this.level = 1;

    this.current = null;
    this.bag = [];
    this.next = null;
    this.cellSize = BLOCK_SIZE;
    this.nextCellSize = BLOCK_SIZE;

    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
    document.addEventListener("keydown", (event) => this.handleKey(event));
    this.startBtn.addEventListener("click", () => this.start());
    this.resumeBtn.addEventListener("click", () => {
      if (this.gameOver) {
        this.start();
      } else {
        this.resume();
      }
    });
    this.overlay.addEventListener("click", (event) => {
      if (event.target === this.overlay && this.paused) {
        this.resume();
      }
    });

    this.draw();
  }

  resizeCanvas() {
    const scale = Math.min(window.innerHeight / (ROWS * BLOCK_SIZE + 120), 1.5);
    this.cellSize = BLOCK_SIZE * scale;
    this.ctx.canvas.width = COLS * this.cellSize;
    this.ctx.canvas.height = ROWS * this.cellSize;
    this.ctx.imageSmoothingEnabled = false;

    this.nextCellSize = BLOCK_SIZE * 0.7 * scale;
    this.nextCtx.canvas.width = 4 * this.nextCellSize;
    this.nextCtx.canvas.height = 4 * this.nextCellSize;
    this.nextCtx.imageSmoothingEnabled = false;

    this.draw();
    this.drawNext();
  }

  randomPiece() {
    if (this.bag.length === 0) {
      this.refillBag();
    }
    const shape = this.bag.pop();
    return new Piece(shape);
  }

  refillBag() {
    const shapes = Object.keys(TETROMINOS);
    for (let i = shapes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shapes[i], shapes[j]] = [shapes[j], shapes[i]];
    }
    this.bag.push(...shapes);
  }

  start() {
    this.board.reset();
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.dropInterval = 1000;
    this.gameOver = false;
    this.paused = false;
    this.hideOverlay();
    this.bag = [];
    this.current = this.randomPiece();
    this.next = this.randomPiece();
    this.updatePanel();
    this.draw();
    this.lastTime = 0;
    this.dropCounter = 0;
    requestAnimationFrame((time) => this.update(time));
  }

  pause() {
    if (this.gameOver || !this.current) return;
    this.paused = true;
    this.overlayTitle.textContent = "Paused";
    this.overlayMessage.textContent = "Press resume or click outside to continue.";
    this.showOverlay();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.hideOverlay();
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.update(time));
  }

  endGame() {
    this.gameOver = true;
    this.overlayTitle.textContent = "Game Over";
    this.overlayMessage.textContent = `You cleared ${this.lines} lines with a score of ${this.score.toLocaleString()}.`;
    this.resumeBtn.textContent = "Play Again";
    this.showOverlay();
  }

  showOverlay() {
    this.overlay.classList.remove("hidden");
  }

  hideOverlay() {
    this.overlay.classList.add("hidden");
    this.resumeBtn.textContent = "Resume";
    this.overlayMessage.textContent = "";
  }

  handleKey(event) {
    if (event.repeat) return;
    if (this.gameOver && event.key.toLowerCase() === "p") {
      event.preventDefault();
      return;
    }

    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        this.move(-1);
        break;
      case "ArrowRight":
        event.preventDefault();
        this.move(1);
        break;
      case "ArrowDown":
        event.preventDefault();
        this.drop();
        break;
      case "ArrowUp":
        event.preventDefault();
        this.rotate();
        break;
      case " ":
        event.preventDefault();
        this.hardDrop();
        break;
      case "p":
      case "P":
        event.preventDefault();
        if (this.paused) {
          this.resume();
        } else {
          this.pause();
        }
        break;
      default:
        break;
    }
  }

  move(dir) {
    if (this.paused || !this.current) return;
    this.current.pos.x += dir;
    if (this.collide()) {
      this.current.pos.x -= dir;
    }
  }

  drop() {
    if (this.paused || !this.current) return;
    this.current.pos.y++;
    if (this.collide()) {
      this.current.pos.y--;
      this.lockPiece();
    }
    this.dropCounter = 0;
  }

  hardDrop() {
    if (this.paused || !this.current) return;
    while (!this.collide()) {
      this.current.pos.y++;
    }
    this.current.pos.y--;
    this.lockPiece(true);
    this.dropCounter = 0;
  }

  rotate(direction = 1) {
    if (this.paused || !this.current) return;
    const pos = this.current.pos.x;
    let offset = 1;
    this.current.rotate(direction);
    while (this.collide()) {
      this.current.pos.x += offset;
      offset = -(offset + (offset > 0 ? 1 : -1));
      if (offset > this.current.matrix[0].length) {
        this.current.rotate(-direction);
        this.current.pos.x = pos;
        return;
      }
    }
  }

  collide(piece = this.current) {
    for (let y = 0; y < piece.matrix.length; y++) {
      for (let x = 0; x < piece.matrix[y].length; x++) {
        if (piece.matrix[y][x]) {
          const boardX = piece.pos.x + x;
          const boardY = piece.pos.y + y;
          if (
            boardX < 0 ||
            boardX >= this.board.cols ||
            boardY >= this.board.rows ||
            (boardY >= 0 && this.board.grid[boardY][boardX])
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  lockPiece(hardDrop = false) {
    this.board.place(this.current);
    const cleared = this.board.clearLines();
    if (cleared > 0) {
      this.score += this.calculateScore(cleared, hardDrop);
      this.lines += cleared;
      if (Math.floor(this.lines / LINES_PER_LEVEL) + 1 > this.level) {
        this.level++;
        this.dropInterval = Math.max(100, this.dropInterval * 0.85);
      }
    }

    this.current = this.next;
    this.next = this.randomPiece();
    if (this.collide()) {
      this.current = null;
      this.endGame();
    }
    this.updatePanel();
  }

  calculateScore(lines, hardDrop) {
    const linePoints = [0, 100, 300, 500, 800];
    const capped = Math.min(lines, linePoints.length - 1);
    const hardDropBonus = hardDrop ? 2 : 1;
    return linePoints[capped] * this.level * hardDropBonus;
  }

  dropGhost(piece) {
    const ghost = piece.clone();
    while (!this.collide(ghost)) {
      ghost.pos.y++;
    }
    ghost.pos.y--;
    return ghost;
  }

  drawCell(x, y, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);
    this.ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);
  }

  drawBoard() {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.board.grid.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          this.drawCell(x, y, COLORS[value]);
        }
      });
    });
  }

  drawPiece(piece, ghost = false) {
    piece.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const color = ghost ? COLORS.ghost : COLORS[piece.shape];
        const posX = piece.pos.x + x;
        const posY = piece.pos.y + y;
        if (posY >= 0) {
          this.drawCell(posX, posY, color);
        }
      });
    });
  }

  drawNext() {
    this.nextCtx.clearRect(0, 0, this.nextCtx.canvas.width, this.nextCtx.canvas.height);
    if (!this.next) return;

    const matrix = this.next.matrix;
    const size = matrix.length;
    const offsetX = Math.floor((4 - size) / 2);
    const offsetY = Math.floor((4 - size) / 2);
    const cell = this.nextCellSize * 0.9;
    const margin = (this.nextCellSize - cell) / 2;

    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          this.nextCtx.fillStyle = COLORS[this.next.shape];
          const drawX = (x + offsetX) * this.nextCellSize + margin;
          const drawY = (y + offsetY) * this.nextCellSize + margin;
          this.nextCtx.fillRect(drawX, drawY, cell, cell);
          this.nextCtx.strokeStyle = "rgba(0, 0, 0, 0.4)";
          this.nextCtx.lineWidth = 1;
          this.nextCtx.strokeRect(drawX, drawY, cell, cell);
        }
      });
    });
  }

  updatePanel() {
    this.scoreEl.textContent = this.score.toLocaleString();
    this.linesEl.textContent = this.lines.toString();
    this.levelEl.textContent = this.level.toString();
    this.drawNext();
  }

  draw() {
    this.drawBoard();
    if (this.current) {
      const ghost = this.dropGhost(this.current);
      this.drawPiece(ghost, true);
      this.drawPiece(this.current);
    }
  }

  update(time = 0) {
    if (this.paused || this.gameOver) return;
    const delta = time - this.lastTime;
    this.lastTime = time;
    this.dropCounter += delta;

    if (this.dropCounter > this.dropInterval) {
      this.drop();
    }

    this.draw();
    requestAnimationFrame((newTime) => this.update(newTime));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new TetrisGame();
});
