/**
 * Sales Service — index.js
 * Base de datos: MongoDB
 * Responsabilidad: Registrar ventas y publicar el evento 'venta.creada' en RabbitMQ
 */

const express  = require("express");
const mongoose = require("mongoose");
const amqplib  = require("amqplib");

const app  = express();
const PORT = process.env.PORT || 8002;

app.use(express.json());

// ── Esquema de venta (MongoDB — flexible por diseño) ──────────────────
const ventaSchema = new mongoose.Schema({
  producto_id: Number,
  cantidad:    Number,
  cliente:     String,
  fecha:       { type: Date, default: Date.now },
  estado:      { type: String, default: "registrada" },
});
const Venta = mongoose.model("Venta", ventaSchema);

let channel;

// ── Conexión a RabbitMQ con reintentos automáticos ────────────────────
async function connectRabbitMQ(retries = 15) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqplib.connect(process.env.RABBITMQ_URL);
      channel    = await conn.createChannel();
      await channel.assertExchange("farmacia_eventos", "topic", { durable: true });
      console.log("[Sales] ✅ Conectado a RabbitMQ");
      return;
    } catch {
      console.log(`[Sales] ⏳ Reintentando RabbitMQ (${i + 1}/${retries})...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("[Sales] ❌ No se pudo conectar a RabbitMQ");
}

// ── Conexión a MongoDB con reintentos automáticos ─────────────────────
async function connectMongo(retries = 15) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(process.env.MONGO_URL);
      console.log("[Sales] ✅ Conectado a MongoDB");
      return;
    } catch {
      console.log(`[Sales] ⏳ Reintentando MongoDB (${i + 1}/${retries})...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("[Sales] ❌ No se pudo conectar a MongoDB");
}

// ── POST /ventas — Registrar venta y publicar evento ─────────────────
app.post("/ventas", async (req, res) => {
  try {
    const { producto_id, cantidad, cliente } = req.body;
    if (!producto_id || !cantidad || !cliente) {
      return res.status(400).json({ error: "producto_id, cantidad y cliente son requeridos" });
    }

    // 1. Guardar la venta en MongoDB (operación local)
    const venta = await Venta.create({ producto_id, cantidad, cliente });

    // 2. Publicar evento 'venta.creada' en RabbitMQ
    const evento = {
      tipo:        "venta.creada",
      venta_id:    venta._id.toString(),
      producto_id: venta.producto_id,
      cantidad:    venta.cantidad,
      cliente:     venta.cliente,
      fecha:       venta.fecha,
    };
    channel.publish(
      "farmacia_eventos",
      "venta.creada",
      Buffer.from(JSON.stringify(evento)),
      { persistent: true }
    );
    console.log(`[Sales] 📤 Evento publicado: venta.creada | venta_id=${venta._id}`);

    res.status(201).json({
      mensaje:  "Venta registrada. El inventario se actualizará en breve (consistencia eventual).",
      venta_id: venta._id,
      estado:   venta.estado,
    });
  } catch (err) {
    console.error("[Sales] ❌ Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /ventas — Listar todas las ventas ─────────────────────────────
app.get("/ventas", async (_req, res) => {
  const ventas = await Venta.find().sort({ fecha: -1 }).limit(20);
  res.json(ventas);
});

// ── Health check ──────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", service: "sales" }));

// ── Iniciar ───────────────────────────────────────────────────────────
(async () => {
  await connectMongo();
  await connectRabbitMQ();
  app.listen(PORT, () => console.log(`[Sales] 🚀 Corriendo en http://localhost:${PORT}`));
})();
