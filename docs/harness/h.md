
## harness
```mermaid
%%{init: {'theme':'base','themeVariables':{'background':'#ffffff','primaryColor':'#ffffff','lineColor':'#3b6ea5','primaryTextColor':'#1a2b3c'}}}%%
flowchart TB
    classDef api stroke:#3b6ea5,stroke-width:2px,color:#3b6ea5,fill:none
    classDef orch stroke:#3a8f6d,stroke-width:2px,color:#3a8f6d,fill:none
    classDef shared stroke:#8a6d3b,stroke-width:2px,color:#8a6d3b,fill:none

    subgraph API["Execution API Layer"]
        T0["Tier0: Raw Completion"]
        T1["Tier1: Single Agent Invocation"]
        T2["Tier2: Full Case Orchestration"]
        T3["Tier3: Custom Workflow (future)"]
    end

    subgraph ORCH["Orchestration Engine"]
        STRAT["Orchestration Strategy<br/>(Main-Sub / Team / Hybrid)"]
        PLAN["Plan / DAG Builder"]
        RECON["Reconcile"]
    end

    subgraph RUNTIME["Agent Runtime"]
        PRIM["Governed Check Agent Primitive<br/>(holistic read -> grouped checkpoints<br/>-> evidence citation)"]
        DOCPIPE["Document Understanding Pipeline<br/>(segment/classify/OCR/signature)"]
    end

    subgraph SHARED["Shared Services"]
        TOOLS["Tool / Extractor Registry"]
        MODELROUTER["Model Router<br/>(DeepSeek / Claude by tier)"]
        EVID["Evidence & Audit Store"]
    end

    API --> STRAT --> PLAN --> PRIM
    PLAN --> DOCPIPE
    PRIM --> RECON
    PRIM --> TOOLS
    PRIM --> MODELROUTER
    RECON --> EVID

    class T0,T1,T2,T3 api
    class STRAT,PLAN,RECON orch
    class PRIM,DOCPIPE,TOOLS,MODELROUTER,EVID shared
```


## lc check

```mermaid
%%{init: {'theme':'base','themeVariables':{'background':'#ffffff','primaryColor':'#ffffff','lineColor':'#3b6ea5','primaryTextColor':'#1a2b3c'}}}%%
flowchart TB
    classDef ui stroke:#3b6ea5,stroke-width:2px,color:#3b6ea5,fill:none
    classDef biz stroke:#2f6690,stroke-width:2px,color:#2f6690,fill:none
    classDef harness stroke:#3a8f6d,stroke-width:2px,color:#3a8f6d,fill:none
    classDef data stroke:#8a6d3b,stroke-width:2px,color:#8a6d3b,fill:none

    subgraph UI["Presentation"]
        WB["LC Check Workbench"]
        GC["LC Compliance Console"]
    end

    subgraph BIZ["LC Check Business Layer"]
        CASESVC["Case Workflow Service"]
        GOVSVC["Governance Service"]
        INGEST["Case Ingestion<br/>(MT700 parse, doc upload)"]
        REVIEW["Review & Feedback Service"]
    end

    subgraph HC["Harness Core (Tier2 call)"]
        EXEC["Execute Case API"]
    end

    subgraph DATA["LC Check Data"]
        PG[("PostgreSQL<br/>Case / Findings / Workflow")]
        GOVSTORE[("Governance Store<br/>Domain Agents / Checkpoints")]
        VEC[("pgvector<br/>Case Library embeddings")]
    end

    WB --> CASESVC
    GC --> GOVSVC
    CASESVC --> INGEST
    CASESVC -->|"case_id + LC fields<br/>+ documents + governance payload"| EXEC
    REVIEW -->|"accept/override/flag-as-case"| CASESVC
    EXEC -->|"findings stream"| CASESVC

    CASESVC --> PG
    GOVSVC --> GOVSTORE
    GOVSVC --> VEC
    GOVSVC -.->|"reads at invocation time"| EXEC

    class WB,GC ui
    class CASESVC,GOVSVC,INGEST,REVIEW biz
    class EXEC harness
    class PG,GOVSTORE,VEC data
    ```


## lc logical flow
```mermaid
LC Check — Logical Solution Flow (