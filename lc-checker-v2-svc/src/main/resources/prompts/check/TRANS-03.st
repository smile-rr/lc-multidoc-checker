RULE: TRANS-03 — Ports of loading and discharge match LC

AUTHORITY
{{ref.UCP-20-a-3.id}} — {{ref.UCP-20-a-3.heading}}
"{{ref.UCP-20-a-3.text}}"

TASK
Where the LC stipulates a port of loading (:44E:) and/or port of discharge
(:44F:), the BOL must indicate matching ports. Per UCP 20(a)(iii), the
named-vessel and stipulated-port requirements are essential.

The match is not always literal:
  - "ANY CHINESE PORT" in :44E: is satisfied by any Chinese port on the BOL
    (Shanghai, Shenzhen, Qingdao, Ningbo, Guangzhou, etc.).
  - "ANY EUROPEAN PORT" similarly.
  - Geographic/regional stipulations require knowledge of port-country
    mapping; apply that knowledge.
  - LC :47A: additional_conditions may override or refine port stipulations.

Each side (loading / discharge) is checked INDEPENDENTLY. If only :44E: is
stipulated, only loading is checked; same for :44F:.

DECISION
- PASS  : every stipulated side matches (literal or regional/category match).
- FAIL  : any stipulated side does not match. Quote both BOL value and LC
          stipulation.
- DOUBTS: the LC stipulation is ambiguous (e.g. "MAIN PORT") and could
          plausibly include or exclude the BOL port.

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS","confidence":0.0-1.0,"explanation":"<one sentence quoting both sides>"}
