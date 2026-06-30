/**
 * Inventory Service — index.js
 * Base de datos: PostgreSQL
 * Responsabilidad:
 *   - Escuchar el evento 'venta.creada' y descontar stock
 *   - Implementar el Outbox Pattern (tabla inventory_outbox)
 *   - Generar evento 'stock.insuficiente' si no hay suficiente stock (SAGA parcial)
 */

const express = require("express");
const { Pool } = require("pg");
const amqplib  = require("amqplib");

const app  = express();
const PORT = process.env.PORT || 8001;

app.use(express.json());

// ── Conexión a PostgreSQL ─────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

let channel;

// ── Conexión a RabbitMQ con reintentos ────────────────────────────────
async function connectRabbitMQ(retries = 15) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqplib.connect(process.env.RABBITMQ_URL);
      channel    = await conn.createChannel();
      await channel.assertExchange("farmacia_eventos", "topic", { durable: true });

      // Suscribirse a 'venta.creada'
      const q = await channel.assertQueue("inventory_ventas", { durable: true });
      await channel.bindQueue(q.queue, "farmacia_eventos", "venta.creada");
      channel.consume(q.queue, procesarVenta, { noAck: false });

      console.log("[Inventory] ✅ Conectado a RabbitMQ, escuchando 'venta.creada'");
      return;
    } catch {
      console.log(`[Inventory] ⏳ Reintentando RabbitMQ (${i + 1}/${retries})...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("[Inventory] ❌ No se pudo conectar a RabbitMQ");
}

// ── Procesar evento de venta ──────────────────────────────────────────
async function procesarVenta(msg) {
  if (!msg) return;
  const evento = JSON.parse(msg.content.toString());
  console.log(`[Inventory] 📥 Evento recibido: venta.creada | producto_id=${evento.producto_id}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Verificar stock disponible
    const { rows } = await client.query(
      "SELECT stock FROM productos WHERE id = $1 FOR UPDATE",
      [evento.producto_id]
    );

    if (rows.length === 0) throw new Error(`Producto ${evento.producto_id} no encontrado`);

    const stockActual = rows[0].stock;

    if (stockActual >= evento.cantidad) {
      // 2a. Hay stock: descontar
      await client.query(
        "UPDATE productos SET stock = stock - $1 WHERE id = $2",
        [evento.cantidad, evento.producto_id]
      );

      // 3a. Registrar en Outbox Pattern
      await client.query(
        "INSERT INTO inventory_outbox (tipo, payload) VALUES ($1, $2)",
        ["stock.descontado", JSON.stringify(evento)]
      );

      await client.query("COMMIT");

      // 4a. Publicar evento de éxito
      channel.publish(
        "farmacia_eventos",
        "stock.descontado",
        Buffer.from(JSON.stringify({ tipo: "stock.descontado", ...evento })),
        { persistent: true }
      );
      console.log(`[Inventory] ✅ Stock descontado: producto=${evento.producto_id} cantidad=${evento.cantidad}`);
    } else {
      // 2b. Stock insuficiente: registrar en Outbox y generar evento de fallo (SAGA)
      await client.query(
        "INSERT INTO inventory_outbox (tipo, payload) VALUES ($1, $2)",
        ["stock.insuficiente", JSON.stringify({ ...evento, stock_disponible: stockActual })]
      );

      await client.query("COMMIT");

      // 4b. Publicar evento de fallo
      channel.publish(
        "farmacia_eventos",
        "stock.insuficiente",
        Buffer.from(JSON.stringify({
          tipo: "stock.insuficiente",
          ...evento,
          stock_disponible: stockActual,
        })),
        { persistent: true }
      );
      console.log(`[Inventory] ⚠️  Stock insuficiente: producto=${evento.producto_id} pedido=${evento.cantidad} disponible=${stockActual}`);
    }

    channel.ack(msg);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Inventory] ❌ Error procesando venta:", err.message);
    channel.nack(msg, false, true);
  } finally {
    client.release();
  }
}

// ── GET /productos ────────────────────────────────────────────────────
app.get("/productos", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM productos ORDER BY id");
  res.json(rows);
});

// ── GET /outbox — Outbox Pattern ──────────────────────────────────────
app.get("/outbox", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM inventory_outbox ORDER BY creado_en DESC LIMIT 20"
  );
  res.json(rows);
});

// ── Health check ──────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", service: "inventory" }));

// ── Iniciar ───────────────────────────────────────────────────────────
(async () => {
  await connectRabbitMQ();
  app.listen(PORT, () => console.log(`[Inventory] 🚀 Corriendo en http://localhost:${PORT}`));
})();
