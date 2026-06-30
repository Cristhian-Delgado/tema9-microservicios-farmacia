/**
 * demo.js — Script de demostración del Tema 9
 *
 * Ejecutar con: node demo.js
 * El script realiza peticiones HTTP reales a los tres microservicios,
 * pausando entre cada paso para facilitar la explicación en vivo.
 */

const BASE_INVENTORY = "http://localhost:8001";
const BASE_SALES     = "http://localhost:8002";
const BASE_AUDIT     = "http://localhost:8003";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url);
  return res.json();
}

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function sep(title) {
  console.log("\n" + "═".repeat(60));
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

async function main() {
  console.log("\n  DEMO — Arquitectura de Microservicios para Farmacia");
  console.log("    IS-404 | ULEAM 2026-1\n");

  // ── PASO 1: Inventario inicial ────────────────────────────────────────
  sep("PASO 1 — Inventario inicial (Inventory Service → PostgreSQL)");
  const productos = await get(`${BASE_INVENTORY}/productos`);
  console.log("Productos disponibles:");
  console.table(productos);
  await sleep(2000);

  // ── PASO 2: Registrar una venta ───────────────────────────────────────
  sep("PASO 2 — Registrar venta (Sales Service → MongoDB + RabbitMQ)");
  const venta = await post(`${BASE_SALES}/ventas`, {
    producto_id: 1,
    cantidad: 3,
    cliente: "María García",
  });
  console.log("Respuesta del Sales Service:");
  console.log(JSON.stringify(venta, null, 2));
  console.log("\n Esperando propagación del evento (consistencia eventual)...");
  await sleep(2500);

  // ── PASO 3: Inventario actualizado ───────────────────────────────────
  sep("PASO 3 — Inventario actualizado (Inventory Service)");
  const productosActualizados = await get(`${BASE_INVENTORY}/productos`);
  console.log("Productos tras la venta:");
  console.table(productosActualizados);
  await sleep(2000);

  // ── PASO 4: Outbox Pattern ────────────────────────────────────────────
  sep("PASO 4 — Outbox Pattern (tabla inventory_outbox)");
  const outbox = await get(`${BASE_INVENTORY}/outbox`);
  console.log("Eventos registrados en el outbox:");
  console.log(JSON.stringify(outbox, null, 2));
  await sleep(2000);

  // ── PASO 5: SAGA — stock insuficiente ────────────────────────────────
  sep("PASO 5 — SAGA parcial: venta con stock insuficiente");
  const ventaFallida = await post(`${BASE_SALES}/ventas`, {
    producto_id: 1,
    cantidad: 999,
    cliente: "Test SAGA",
  });
  console.log("Respuesta (venta registrada en Sales, pero...):");
  console.log(JSON.stringify(ventaFallida, null, 2));
  console.log("\n Esperando evento de fallo...");
  await sleep(2500);

  // ── PASO 6: Outbox tras fallo ─────────────────────────────────────────
  sep("PASO 6 — Outbox tras el fallo de stock");
  const outbox2 = await get(`${BASE_INVENTORY}/outbox`);
  console.log("Outbox actualizado (incluye stock.insuficiente):");
  console.log(JSON.stringify(outbox2, null, 2));
  await sleep(2000);

  // ── PASO 7: Auditoría completa ────────────────────────────────────────
  sep("PASO 7 — Auditoría completa (Audit Service → PostgreSQL)");
  const auditoria = await get(`${BASE_AUDIT}/auditoria`);
  console.log("Historial completo de eventos:");
  console.log(JSON.stringify(auditoria, null, 2));

  sep("  DEMO COMPLETADA");
  console.log("Resumen:");
  console.log("  • Sales Service  → venta registrada en MongoDB");
  console.log("  • Inventory Svc  → stock descontado vía evento (PostgreSQL)");
  console.log("  • Outbox         → eventos persistidos antes de publicar");
  console.log("  • SAGA parcial   → fallo detectado sin bloquear el sistema");
  console.log("  • Audit Service  → todos los eventos registrados (LOPDP)\n");
}

main().catch((err) => {
  console.error(" Error en la demo:", err.message);
  process.exit(1);
});
