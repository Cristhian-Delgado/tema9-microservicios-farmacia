/**
 * Audit Service — index.js
 * Base de datos: PostgreSQL
 * Responsabilidad:
 *   - Escuchar TODOS los eventos del sistema (routing_key = '#')
 *   - Registrarlos para trazabilidad y cumplimiento normativo (LOPDP)
 *   - Cero acoplamiento: ningún otro servicio sabe que existe
 */

const express = require("express");
const { Pool } = require("pg");
const amqplib  = require("amqplib");

const app  = express();
const PORT = process.env.PORT || 8003;

app.use(express.json());

// ── Conexión a PostgreSQL ─────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// ── Conexión a RabbitMQ con reintentos ────────────────────────────────
async function connectRabbitMQ(retries = 15) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn    = await amqplib.connect(process.env.RABBITMQ_URL);
      const channel = await conn.createChannel();
      await channel.assertExchange("farmacia_eventos", "topic", { durable: true });

      // Suscribirse a TODOS los eventos con routing_key '#'
      const q = await channel.assertQueue("audit_todos", { durable: true });
      await channel.bindQueue(q.queue, "farmacia_eventos", "#");

      channel.consume(q.queue, async (msg) => {
        if (!msg) return;
        const routingKey = msg.fields.routingKey;
        const payload    = JSON.parse(msg.content.toString());

        await pool.query(
          "INSERT INTO auditoria_eventos (tipo, routing_key, payload) VALUES ($1, $2, $3)",
          [payload.tipo || routingKey, routingKey, JSON.stringify(payload)]
        );
        console.log(`[Audit] 📋 Evento registrado: ${routingKey}`);
        channel.ack(msg);
      }, { noAck: false });

      console.log("[Audit] ✅ Conectado a RabbitMQ, escuchando TODOS los eventos (#)");
      return;
    } catch {
      console.log(`[Audit] ⏳ Reintentando RabbitMQ (${i + 1}/${retries})...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("[Audit] ❌ No se pudo conectar a RabbitMQ");
}

// ── GET /auditoria — Historial completo de eventos ────────────────────
app.get("/auditoria", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM auditoria_eventos ORDER BY registrado_en DESC LIMIT 50"
  );
  res.json(rows);
});

// ── GET /auditoria/:tipo — Filtrar por tipo de evento ─────────────────
app.get("/auditoria/:tipo", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM auditoria_eventos WHERE tipo = $1 ORDER BY registrado_en DESC LIMIT 20",
    [req.params.tipo]
  );
  res.json(rows);
});

// ── Health check ──────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", service: "audit" }));

// ── Iniciar ───────────────────────────────────────────────────────────
(async () => {
  await connectRabbitMQ();
  app.listen(PORT, () => console.log(`[Audit] 🚀 Corriendo en http://localhost:${PORT}`));
})();
