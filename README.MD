# LC Checker v2.0— Solution Document



## Versions

### v1.0 — LC Invoice Checker

A POC proving vision model and LLM integration for document data extraction and UCP 600 / ISBP 821 rule checking.

- git repo: https://github.com/smile-rr/lc-invoice-checker
- demo: https://lccheck.moments-plus.com/

------

### v2.0 — LC Checker, Multiple Document Support

Extends v1 with multi-document support and addresses real-world business implementation considerations for LC examination.

- git repo: https://github.com/smile-rr/lc-multidoc-checker
- demo: https://lccheck-v2.moments-plus.com/



## Operation Flow

v2's design view of the LC examination operational flow after AI integration — how the work
is shaped end-to-end with the LLM in the loop.

![Operation Flow](docs/diagrams/operation-flow.png)



## Governance

The maintainable assets — rules, prompts, references — that the business and engineering teams
own jointly to keep the platform extensible.

![Governance](docs/diagrams/govenance.png)



## Rule Types

| **Type**          | **Description**                                          | **Reasoning** | **Iteration** | **Est. Cost** |
| :---------------- | :------------------------------------------------------- | :------------ | :------------ | :------------ |
| **Programmatic**  | SpEL expression checks. **No LLM.**                      | n/a           | 0             | $0            |
| **Agent**         | Single LLM call. Prompt includes fields and rules.       | false         | 1 call        | ~$0.01        |
| **Agent + Tools** | LLM call with calculation tools (math, dates, currency). | false         | ≤3 calls      | ~$0.03        |
| **Agentic**       | ReAct loop: reason → act → repeat. Has iteration limit.  | **true**      | ≤6 calls      | ~$0.06        |

**Cost Estimation** — Benchmarked against GPT-4o ($2.50/M input, $10.00/M output). 

6 docs × 2 vision slots + 20 rules ≈ 112K tokens → **~$0.37 per presentation**.



## System Flow

The system deployment architecture and the runtime flow across its components.

![System Flow](docs/diagrams/system-flow.png)



## Implementation Strategy

### AI as an assistant plugin:

The AI workbench integration in the existing process —  same officer roles, same sign-off authority, same audit format.  

Existing system remains primary in Phase 1 so the team can  validate AI output against known ground truth before  gradually shifting load across.

### AI driven system:

| Phase       | Timeline     | AI-Driven System                                             | Existing System             |
| ----------- | ------------ | ------------------------------------------------------------ | --------------------------- |
| **Phase 1** | 6 months     | • 100% parse verification  <br />• 100% rule result verification   <br />• 100% human sign-off | Parallel<br />*(Primary)*   |
| **Phase 2** | 3 months     | • System randomly selects 50% for parse verification   <br />• System randomly selects 50% for rule result verification   <br />• 100% human sign-off | Parallel<br />*(Secondary)* |
| **Phase 3** | Steady State | • System randomly selects 30% for parse verification   <br />• System randomly selects 30% for rule result verification   <br />• 100% human sign-off | Sunset                      |



## Opinion

### Improvement cycle

- **Accumulate document parsing corrections** as few-shot examples to keep improving VLM prompts
- **Accumulate rule decision corrections per rule** as few-shot examples to keep improving rule prompts

### On RAG

- **Build a Case Knowledge Base from closed cases** — mine patterns into new Agent rules, and let officers search precedents via RAG when making judgment calls

- RAG on UCP 600 / ISBP 821 — **the ruleset fits in context per rule**,  so there's no retrieval problem to solve; **RAG** only **adds the risk of silently missing a clause**, which is unacceptable in compliance**