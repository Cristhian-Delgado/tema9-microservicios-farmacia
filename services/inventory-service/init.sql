-- Tabla de productos con stock
CREATE TABLE IF NOT EXISTS productos (
    id         SERIAL PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    stock      INTEGER NOT NULL DEFAULT 0,
    precio     NUMERIC(10,2),
    categoria  VARCHAR(50)
);

-- Tabla Outbox Pattern: eventos persistidos antes de publicar al broker
CREATE TABLE IF NOT EXISTS inventory_outbox (
    id         SERIAL PRIMARY KEY,
    tipo       VARCHAR(50) NOT NULL,
    payload    JSONB NOT NULL,
    creado_en  TIMESTAMP DEFAULT NOW()
);

-- Datos iniciales
INSERT INTO productos (nombre, stock, precio, categoria) VALUES
    ('Paracetamol 500mg', 100, 0.50,  'Medicamento'),
    ('Ibuprofeno 400mg',   80, 0.75,  'Medicamento'),
    ('Amoxicilina 500mg',  60, 1.20,  'Medicamento'),
    ('Suero fisiológico',  50, 2.00,  'Insumo'),
    ('Alcohol antiséptico',40, 1.50,  'Insumo'),
    ('Crema hidratante',   30, 5.00,  'Cosmético');
