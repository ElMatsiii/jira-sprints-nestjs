# 🔶 MS2: Jira Sprints Service (`jira-sprints-nestjs`)

[![Node Version](https://img.shields.io/badge/Node-v20+-green.svg?logo=nodedotjs)]()
[![NestJS](https://img.shields.io/badge/NestJS-v10-ea2849.svg?logo=nestjs)]()
[![Coverage](https://img.shields.io/badge/Coverage-85.99%25-brightgreen.svg)]()
[![gRPC Server](https://img.shields.io/badge/gRPC_Server-:50052-244c5a.svg)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql&logoColor=white)]()

Microservicio orquestador ágil implementado en **TypeScript** con **NestJS**. Administra la creación, planificación y ciclo de vida de los **Sprints**, integrándose como servidor **gRPC** en el puerto `:50052`, cliente gRPC síncrono hacia MS1 (Go), cliente asíncrono **Kafka Request-Reply** hacia MS3 (.NET 8), y receptor gRPC de alertas de velocidad.

---

## 🏛️ Rol en la Arquitectura e Interoperabilidad Híbrida

Este microservicio ejemplifica de forma directa la **Regla de Interoperabilidad de la Pizarra**:

```mermaid
sequenceDiagram
    autonumber
    participant BFF as BFF Gateway (GraphQL)
    participant S2 as 🔶 MS2: Sprints (NestJS :50052)
    participant S1 as 🔷 MS1: Issues (Go :50051)
    participant S3 as 🟣 MS3: Analytics (.NET 8 / Kafka)

    BFF->>S2: gRPC: PlanSprint(projectId, capacity)
    Note over S2: Invocación en el protocolo destino de Go (gRPC)
    S2->>S1: gRPC :50051 (GetBacklogIssues / BatchAssignToSprint)
    S1-->>S2: Protobuf Response (IssueListProto)
    Note over S2: Invocación en el protocolo destino de .NET (Kafka)
    S2->>S3: Kafka Produce 'analytics.query' (CorrelationId + Timeout 5s)
    S3-->>S2: Kafka Consume 'analytics.reply' (Métricas de velocidad)
    Note over S2: S2 ensambla el plan y responde en su protocolo local
    S2-->>BFF: gRPC Response: PlanSprintResponseProto

    Note over S3,S2: Canal Inverso de Alertas
    S3->>S2: gRPC :50052: AlertService.TriggerSprintAlert(sprintId, riskLevel)
```

### Protocolos de Entrada y Salida
* **Ingress (Entrada):**
  * **gRPC Server** en `:50052` implementando `SprintsService` y `AlertService` (`sprints.proto`).
* **Egress (Salida):**
  * **gRPC Client** hacia `jira-issues-go:50051` con Circuit Breaker integrado.
  * **Kafka Request-Reply Client** publicando en `analytics.query` y suscribiéndose a `analytics.reply` con cabecera de correlación `kafka_correlationId`.
* **Persistencia:**
  * **PostgreSQL 15** (`sprints_db` en puerto `:5433` / `:5432`) mediante TypeORM.

---

## 📂 Estructura del Proyecto

```text
jira-sprints-nestjs/
├── src/
│   ├── alerts/                  # Módulo gRPC AlertService (notificaciones desde .NET)
│   │   ├── controllers/         # AlertGrpcController
│   │   ├── entities/            # AlertEntity (TypeORM)
│   │   └── services/            # AlertService
│   ├── common/                  # Excepciones, filtros gRPC y utilidades
│   │   ├── filters/             # GrpcExceptionFilter
│   │   └── utils/               # CircuitBreaker con estados CLOSED, OPEN, HALF_OPEN
│   ├── config/                  # ConfigurationService tipado con Joi
│   ├── database/                # Conexión TypeORM y entidades relacionales
│   │   └── entities/            # SprintEntity, SprintIssueEntity, SprintAlertEntity
│   ├── grpc/                    # Cliente gRPC hacia Go (:50051)
│   │   └── issues-grpc.client.ts
│   ├── kafka/                   # Patrón Request-Reply sobre Kafka
│   │   └── kafka-request-reply.service.ts
│   ├── mappers/                 # Mapeadores Protobuf <-> Entidades TypeScript
│   ├── protos/                  # Definiciones locales de sprints.proto e issues.proto
│   ├── sprints/                 # Módulo de lógica de negocio de Sprints
│   │   ├── controllers/         # SprintsGrpcController
│   │   └── services/            # SprintsService
│   ├── app.module.ts
│   └── main.ts                  # Microservice bootstrap (gRPC Transport)
├── test/                        # Pruebas e2e
├── .github/workflows/
│   └── ci.yml                   # CI Pipeline (validación Jest >= 60%)
├── Dockerfile                   # Multi-stage build Node.js Alpine
├── package.json
└── tsconfig.json
```

---

## ⚙️ Variables de Entorno

| Variable | Descripción | Valor por Defecto |
| :--- | :--- | :--- |
| `GRPC_PORT` | Puerto de escucha gRPC | `50052` |
| `DATABASE_URL` | Conexión PostgreSQL | `postgres://jira_user:jira_password@localhost:5433/sprints_db` |
| `GO_ISSUES_GRPC_URL` | URL de conexión gRPC a MS1 (Go) | `localhost:50051` |
| `KAFKA_BROKERS` | Lista de brokers Kafka | `localhost:9092` |
| `KAFKA_CLIENT_ID` | Identificador de cliente Kafka | `sprints-service-client` |
| `KAFKA_GROUP_ID` | Grupo de consumidores Kafka | `sprints-service-group` |

---

## 🧪 Pruebas Automatizadas y Cobertura

El servicio cuenta con tests unitarios y de integración con mocks completos para gRPC y Kafka:

```bash
# Instalar dependencias
npm install

# Compilar proyecto TypeScript
npm run build

# Ejecutar suite de pruebas con análisis de cobertura
npm test
```

### Métrica de Cobertura Verificada
* **Statements:** **85.99%**
* **Branches:** **76.00%**
* **Functions:** **88.23%**
* **Lines:** **87.12%**
* Todas las suites de prueba (`*.spec.ts`) pasan limpiamente.

---

## 🐳 Despliegue con Docker

```bash
# Compilar la imagen
docker build -t jira-ai-sprints-service .

# Ejecutar el contenedor
docker run -d -p 50052:50052 \
  -e DATABASE_URL="postgres://jira_user:jira_password@postgres-sprints:5432/sprints_db" \
  -e GO_ISSUES_GRPC_URL="issues-service:50051" \
  -e KAFKA_BROKERS="kafka:9092" \
  jira-ai-sprints-service
```

---

## 📄 Licencia

MIT License © 2026 Jira AI Team.
