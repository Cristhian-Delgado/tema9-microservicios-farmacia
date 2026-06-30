-- Tabla de auditoría: registra todos los eventos del sistema
CREATE TABLE IF NOT EXISTS auditoria_eventos (
    id             SERIAL PRIMARY KEY,
    tipo           VARCHAR(100) NOT NULL,
    routing_key    VARCHAR(100) NOT NULL,
    payload        JSONB NOT NULL,
    registrado_en  TIMESTAMP DEFAULT NOW()
);

-- Índice para consultas por tipo de evento
CREATE INDEX IF NOT EXISTS idx_auditoria_tipo ON auditoria_eventos (tipo);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria_eventos (registrado_en DESC);
