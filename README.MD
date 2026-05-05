# LC Checker v2.0— Solution Document



## Versions

**v1.0 — LC Invoice Checker**

A POC of AI integration into LC checking: single-document vision-model parsing paired with the
initial LC rule-solution definition.

- git repo: https://github.com/smile-rr/lc-invoice-checker
- demo: https://lccheck.moments-plus.com/



**v2.0 — LC Checker, Multiple Document Support**

Extends v1 with multi-document support and reshapes the workflow to reflect a real
operational LC examination flow.

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



## System Flow

The system deployment architecture and the runtime flow across its components.

![System Flow](docs/diagrams/system-flow.png)





