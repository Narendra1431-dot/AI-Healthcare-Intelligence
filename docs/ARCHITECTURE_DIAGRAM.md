# AI Healthcare Intelligence — Architecture Diagram

## Overview

This document provides the canonical architecture diagram for the **AI Healthcare Intelligence** platform — a production-grade, privacy-first clinical decision support system built on FastAPI (backend), React 19 (frontend), and SQLite (demo database).

## System Architecture

```mermaid
graph TB
    subgraph "CLIENT SURFACE"
        FE["React 19 SPA (Vite + Bun)"]
        direction TB
        FE -->|"HTTP/gzip"| GW
    end

    subgraph "API GATEWAY & SECURITY — FastAPI"
        MW["8-Layer Middleware Stack"]
        ROUTERS["REST API Routers"]
        MW --> ROUTERS
    end

    subgraph "CLINICAL INTELLIGENCE & ORCHESTRATION"
        AGENT["LangGraph Supervisor Agent"]
        CORE["Core AI Provider Gateway (Ollama → Gemini → Cloud)"]
        EVAL["ML Evaluation Module (AUC-ROC, Sensitivity, Specificity)"]
    end

    subgraph "DATA & PERSISTENCE"
        DB[(SQLite WAL / PostgreSQL)]
        VS[(Vector Store — turbovec SIMD Index)]
        ML[(5 ML Classifiers + Scalers .pkl)]
    end

    subgraph "DATA ENGINEERING & MLOps"
        AIRFLOW["Apache Airflow (DAG Orchestration)"]
        SPARK["PySpark Streaming & Batch"]
        DELTA[("Delta Lake Medallion (Bronze/Silver/Gold)")]
    end

    %% Connections
    FE --> MW
    ROUTERS --> AGENT
    ROUTERS --> CORE
    ROUTERS --> EVAL
    ROUTERS --> DB
    AGENT --> VS
    AGENT --> CORE
    CORE --> ML
    CORE --> VS
    EVAL --> ML
    AIRFLOW --> DB
    SPARK --> DELTA
    DELTA --> DB
    AGENT -.-> AIRFLOW

    %% Styling
    classDef client fill:#f0f9ff,stroke:#0ea5e9,color:#082f49;
    classDef gateway fill:#f5f3ff,stroke:#8b5cf6,color:#240e4f;
    classDef intel fill:#ecfdf5,stroke:#10b981,color:#043d32;
    classDef data fill:#fff7ed,stroke:#f97316,color:#451a03;
    classDef devops fill:#f0fdf4,stroke:#22c55e,color:#14532d;

    class FE client
    class MW,ROUTERS gateway
    class AGENT,CORE,EVAL intel
    class DB,VS,ML data
    class AIRFLOW,SPARK,DELTA devops
```

## Demo Environment Architecture

The demo runs as two local processes on `127.0.0.1`:

```mermaid
graph LR
    subgraph "Local Development Machine (127.0.0.1)"
        subgraph "Frontend"
            PORT3000["Vite Dev Server :3000"]
            BUNDLE["React 19 SPA (TypeScript, Tailwind CSS)"]
        end

        subgraph "Backend"
            PORT8000["Uvicorn ASGI Server :8000"]
            FASTAPI["FastAPI App"]
            DBLOCAL[("healthcare.db — SQLite WAL")]
            RAGLOCAL["Local RAG Fallback (JSON + LSH)"]
            CACHELOCAL["Semantic Cache (Cosine Sim)"]
        end

        subgraph "Local AI (Optional)"
            OLLAMA["Ollama Service :11434"]
            LLM["Llama 3.2 8B (Local Inference)"]
        end
    end

    PORT3000 -->|"HTTP /v1 proxy"| PORT8000
    PORT8000 --> FASTAPI
    FASTAPI --> DBLOCAL
    FASTAPI --> RAGLOCAL
    FASTAPI --> CACHELOCAL
    FASTAPI -->|"Ollama fallback"| OLLAMA
    OLLAMA --> LLM

    classDef feBox fill:#f0f9ff,stroke:#0ea5e9;
    classDef beBox fill:#f5f3ff,stroke:#8b5cf6;
    classDef aiBox fill:#ecfdf5,stroke:#108980;
    classDef dbBox fill:#fff7ed,stroke:#f92016;

    class PORT3000,BUNDLE feBox
    class PORT8000,FASTAPI beBox
    class OLLAMA,LLM aiBox
    class DBLOCAL,RAGLOCAL,CACHELOCAL dbBox
```

## Intelligence API Data Flow

```mermaid
sequenceDiagram
    participant Clinician
    participant Frontend as React SPA (3000)
    participant API as FastAPI (8000)
    participant DB as SQLite / PostgreSQL
    participant AI as Core AI Gateway
    participant RAG as Local RAG Cache

    Clinician->>Frontend: Navigate to /dashboard, /risk, /intelligence
    Frontend->>API: GET /v1/intelligence/doctor-dashboard
    API->>DB: Query patients, labs, medications, reviews
    API->>RAG: Semantic cache lookup
    RAG-->>API: Cached response or cache miss
    API->>AI: LLM synthesis (Ollama/Gemini)
    AI-->>API: Synthesized clinical insights
    API-->>Frontend: JSON aggregated data
    Frontend->>Frontend: Render dashboard cards, tables, charts
    Frontend->>Clinician: Display: 1 priority patient, 7 abnormal labs, 3 reviews, 10 care gaps

    Note over Frontend,API: All API calls proxied via /v1 prefix
```

## Component Diagram (Frontend)

```mermaid
graph TD
    App[App.tsx — Vite React Router]
    App --> AuthGuard[AuthGuard — JWT Session Check]
    AuthGuard --> AppShell[AppShell — Layout + TopNav]
    AppShell --> Pages["Lazy Pages:<br/>Dashboard, Patients,<br/>PatientDetail, Intelligence,<br/>RiskCenter, Reports,<br/>Evidence, CareGaps,<br/>Agents, Reviews,<br/>Appointments, PatientDashboard"]
    AppShell --> UI["Shared Components:<br/>MetricCard, Panel, Badge,<br/>Skeleton, EmptyState,<br/>ErrorState, Button, Card"]
    AppShell --> API["API Clients:<br/>apiIntelligence.ts,<br/>apiCore.ts,<br/>api.ts"]
    API --> Backend["Backend API (8000)"]

    classDef layout fill:#f5f3ff,stroke:#8b5cf6;
    classDef ui fill:#ecfdf5,stroke:#10b981;
    classDef api fill:#fff7ed,stroke:#f97316;
    classDef pages fill:#f0f9ff,stroke:#0ea5e9;

    class App,AuthGuard,AppShell layout
    class UI ui
    class API,Backend api
    class Pages pages
```

## Navigation Map — 14 Captured Views

```mermaid
graph LR
    Login["01: Login Page\n/login"]
    Admin["02: Admin Panel\n/admin"]
    Dashboard["03: Doctor Dashboard\n/dashboard"]
    Patients["04: Patients List\n/patients"]
    PatientDetail["05: Patient Detail\n/patients/4"]
    Intel["06: Clinical Intelligence\n/intelligence"]
    Risk["07: Risk Center\n/risk"]
    Reports["08: Reports\n/reports"]
    Evidence["09: Evidence\n/evidence"]
    CareGaps["10: Care Gaps\n/care-gaps"]
    Agents["11: Agents\n/agents"]
    Reviews["12: Reviews\n/reviews"]
    Appt["13: Appointments\n/appointments"]
    PatientDash["14: Patient Dashboard\n/patient"]

    Login --> Admin
    Admin --> Dashboard
    Dashboard --> Patients
    Patients --> PatientDetail
    Dashboard --> Intel
    Dashboard --> Risk
    Dashboard --> Reports
    Dashboard --> Evidence
    Dashboard --> CareGaps
    Dashboard --> Agents
    Dashboard --> Reviews
    Dashboard --> Appt
    Dashboard --> PatientDash

    classDef captured fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:2px;
    class Login,Admin,Dashboard,Patients,PatientDetail,Intel,Risk,Reports,Evidence,CareGaps,Agents,Reviews,Appt,PatientDash captured
```
