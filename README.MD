# LC Checker v2.0— Solution Document



## Versions

**v1.0  LC Invoice Checker**: 

this focus on the happy flow to perform Vision Model Parsing of Commercial Invoice document. and the establish LC rule solutions base.

git repo: https://github.com/smile-rr/lc-invoice-checker

demo: https://lccheck.moments-plus.com/



**v2.0 LC Checker - Multiple Document support**

this version will be more practical to reflect LC domain real practice and LLM usage as co-assistant to human checkers to improve the efficiency.

git repo : https://github.com/smile-rr/lc-multidoc-checker

demo: https://lccheck-v2.moments-plus.com/





## Document Parse

1. QA Stage: 

   2 Private deployed small size LLM Model as baseline 

   1 Large Language Model as Judge (considering complianced document for QA testing)

   Human review and correction, confirmation as gating.

2. Prod Stage

   2 Private deployed small size llm model as QA stage.

   Human reviewing correction, confirmation as gating.

## Examine Rule

1. Orgnize rules with in controled number rules
2. Programic: Direct checks on exact match field needs
3. Agent: similiarity checks according to language driven features
4. Agent + Tool:  similiarity check which also require utility tools and additional information.   max tool call limit: 3
5. Agentic: enabled reasoning by default. with tool call capabilites.  designed for 45A(Good Description), 47 A(Additional conditions) max limit: 3 tool call, 3 llm call or adjustable





**Release Plan**

Phase 1. Parallel run with tranditional LC Check  system vs LLM assisted LC check system. 

Phase 2. manual verification enabled for each rule result with user confirmation.   Pass/Failed/Doubts

Phase 3. according to success rate. Enable random verification on Passed rule with (ratio control), Failed/Doubts mandatory for verification

Phase 4. random manual verification and confirmation enabled, and Human as checker signoff.

