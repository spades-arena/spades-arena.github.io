/**
 * Spades by Hadzz - Minimal zero-dependency WebSocket (RFC 6455) server layer.
 * Supports text frames, fragmentation, ping/pong heartbeats and clean close.
 * Messages larger than MAX_PAYLOAD are rejected (the protocol only uses small JSON).
 */
'use strict';

const crypto = require('crypto');
const { EventEmitter } = require('events');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 16 * 1024;

class WsConnection extends EventEmitter {
  constructor(socket, req) {
    super();
    this.socket = socket;
    this.req = req;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentBytes = 0;
    this.isOpen = true;
    this.isAlive = true;

    socket.setNoDelay(true);
    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._finalize());
    socket.on('end', () => this._finalize());
    socket.on('error', () => this._finalize());
  }

  _onData(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;

    while (this.isOpen && this.buffer.length >= 2) {
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let length = b1 & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const high = this.buffer.readUInt32BE(2);
        if (high !== 0) return this.terminate();
        length = this.buffer.readUInt32BE(6);
        offset = 10;
      }

      // Browsers must mask client frames; oversize frames are hostile.
      if (!masked || length > MAX_PAYLOAD) return this.terminate();
      if (this.buffer.length < offset + 4 + length) return;

      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buffer = this.buffer.subarray(offset + 4 + length);

      this._handleFrame(fin, opcode, payload);
    }
  }

  _handleFrame(fin, opcode, payload) {
    switch (opcode) {
      case 0x0: // continuation
      case 0x1: // text
      case 0x2: // binary
        if (opcode !== 0x0) {
          this.fragments = [];
          this.fragmentBytes = 0;
        }
        this.fragments.push(payload);
        this.fragmentBytes += payload.length;
        if (this.fragmentBytes > MAX_PAYLOAD) return this.terminate();
        if (fin) {
          const message = Buffer.concat(this.fragments).toString('utf8');
          this.fragments = [];
          this.fragmentBytes = 0;
          this.emit('message', message);
        }
        break;
      case 0x8: // close
        this._writeFrame(0x8, payload.subarray(0, 2));
        this.socket.end();
        this._finalize();
        break;
      case 0x9: // ping
        this._writeFrame(0xa, payload);
        break;
      case 0xa: // pong
        this.isAlive = true;
        break;
      default:
        this.terminate();
    }
  }

  _writeFrame(opcode, payload) {
    if (!this.isOpen || this.socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(len, 6);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }

  send(text) {
    this._writeFrame(0x1, Buffer.from(String(text), 'utf8'));
  }

  ping() {
    this._writeFrame(0x9, Buffer.alloc(0));
  }

  close() {
    this._writeFrame(0x8, Buffer.from([0x03, 0xe8])); // 1000 normal closure
    this.socket.end();
    this._finalize();
  }

  terminate() {
    this.socket.destroy();
    this._finalize();
  }

  _finalize() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.emit('close');
  }
}

/**
 * Attaches a WebSocket endpoint at `path` to an existing http.Server.
 * Calls onConnection(conn) for each accepted socket.
 */
function attachWebSocketServer(httpServer, { path = '/ws', onConnection, heartbeatMs = 25000 }) {
  const connections = new Set();

  httpServer.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://localhost');
    const key = req.headers['sec-websocket-key'];
    const upgrade = String(req.headers.upgrade || '').toLowerCase();

    if (url.pathname !== path || !key || upgrade !== 'websocket') {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const conn = new WsConnection(socket, req);
    connections.add(conn);
    conn.on('close', () => connections.delete(conn));
    onConnection(conn);
  });

  const heartbeat = setInterval(() => {
    for (const conn of connections) {
      if (!conn.isAlive) {
        conn.terminate();
        continue;
      }
      conn.isAlive = false;
      conn.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  return { connections };
}

module.exports = { attachWebSocketServer };
