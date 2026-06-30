# Tema 9 — Microservicios, Patrones de Datos y Arquitectura Integradora

**IS-404 Administración de Bases de Datos Distribuidas | ULEAM 2026-1**

> Práctica que construye una mini arquitectura de microservicios para una cadena de farmacias en Ecuador. Tres servicios independientes que **no comparten base de datos** entre sí y se comunican exclusivamente mediante eventos asíncronos a través de RabbitMQ.

---

## Arquitectura del sistema

```
Cliente
  │
  ▼
Sales Service (Puerto 8002) ──── MongoDB
  │  publica evento 'venta.creada'
  ▼
RabbitMQ (Broker de mensajes)
  │
  ├──► Inventory Service (Puerto 8001) ──── PostgreSQL
  │        descuenta stock
  │
  └──► Audit Service (Puerto 8003) ──── PostgreSQL
           registra todos los eventos (LOPDP)
```

### Microservicios

| Servicio | Puerto | Base de datos | Responsabilidad |
|----------|--------|---------------|-----------------|
| **Sales Service** | 8002 | MongoDB | Registra la venta. Responde de inmediato, sin esperar al inventario |
| **Inventory Service** | 8001 | PostgreSQL | Escucha el evento de venta y descuenta el stock |
| **Audit Service** | 8003 | PostgreSQL | Escucha **todos** los eventos del sistema para trazabilidad (LOPDP) |

---

## Patrones implementados

| Patrón | Descripción |
|--------|-------------|
| **Database-per-Service** | Cada servicio tiene su propia base de datos aislada |
| **Event-Driven Architecture** | Comunicación mediante eventos asíncronos, sin llamadas HTTP directas |
| **Outbox Pattern** | Los eventos se persisten localmente antes de publicarse al broker |
| **Consistencia eventual** | El sistema se sincroniza gradualmente, priorizando disponibilidad |
| **SAGA (parcial)** | Manejo de fallos de stock sin bloquear el sistema |
| **Observabilidad** | El Audit Service captura todos los eventos con cero acoplamiento |

---

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y en ejecución
- [Node.js](https://nodejs.org/) v18 o superior
- [Git](https://git-scm.com/)

---

## Pasos de la práctica

### Paso 1 — Clonar el repositorio

```bash
git clone https://github.com/Cristhian-Delgado/tema9-microservicios-farmacia.git
cd tema9-microservicios-farmacia
```

### Paso 2 — Levantar la infraestructura

```bash
docker compose up -d --build
```

Esto construye las imágenes de Node.js para los 3 microservicios y levanta los 7 contenedores:
- RabbitMQ (broker de mensajes)
- 2 instancias de PostgreSQL (Inventory + Audit)
- MongoDB (Sales)
- Los 3 microservicios

### Paso 3 — Verificar que todo está corriendo

```bash
docker compose ps
```

Todos los contenedores deben aparecer con estado `Up` o `Healthy`.

### Paso 4 — Ejecutar la demo automatizada

```bash
node demo.js
```

El script realiza peticiones HTTP reales a los tres microservicios en orden, pausando entre cada paso para facilitar la explicación en vivo.

### Paso 5 — Consultar productos e inventario

```bash
# PowerShell
Invoke-RestMethod http://localhost:8001/productos



### Paso 6 — Registrar una venta

```bash
# PowerShell
Invoke-RestMethod -Method POST -Uri "http://localhost:8002/ventas" `
  -ContentType "application/json" `
  -Body '{"producto_id": 1, "cantidad": 2, "cliente": "Juan Pérez"}'

### Paso 7 — Verificar el Outbox Pattern

```bash
# PowerShell
Invoke-RestMethod http://localhost:8001/outbox


### Paso 8 — Consultar la auditoría

```bash
# PowerShell
Invoke-RestMethod http://localhost:8003/auditoria


### Paso 9 — Probar SAGA: venta con stock insuficiente

```bash
# PowerShell
Invoke-RestMethod -Method POST -Uri "http://localhost:8002/ventas" `
  -ContentType "application/json" `
  -Body '{"producto_id": 1, "cantidad": 999, "cliente": "Test SAGA"}'


El Inventory Service genera un evento `stock.insuficiente` en lugar de bloquear el sistema.

### Paso 10 — Conexión directa a las bases de datos

```bash
# PostgreSQL — Inventario
docker exec -it farmacia_inventory_db psql -U inv_user -d inventario
#prueba en SQL
SELECT * FROM productos;
#para salir
\q
# MongoDB — Ventas
docker exec -it farmacia_sales_db mongosh -u sales_user -p sales_pass --authenticationDatabase admin
```
#consulta
show dbs
#Para salir
exit

### Paso 11 — Apagar el entorno

```bash
# Detener sin borrar datos
docker compose down

# Detener y borrar datos (para reiniciar desde cero)
docker compose down -v
```

---

