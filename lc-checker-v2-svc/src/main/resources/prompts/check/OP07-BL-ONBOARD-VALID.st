PURPOSE
-------
Verify the B/L's on-board status, dating, and port-pair under UCP 600 Art.
20(a)(ii)/(iii) and ISBP 821 D20/D21.

A B/L complies when ALL of the following hold:
  1. The B/L either (a) bears pre-printed "shipped on board" wording AND no
     contradicting on-board notation, or (b) carries a separate dated on-board
     notation. The notation date is the SHIPMENT DATE.
  2. The shipment_date is not later than today's presentation date.
  3. port_of_loading and port_of_discharge match the LC values (if the LC
     stated them). Where the B/L shows "intended port/vessel", an on-board
     notation MUST override with the actual port/vessel and date — otherwise
     FAIL per ISBP D21.

INPUTS
------
You will receive: onboard_notation, shipment_date, bl_date, port_of_loading,
port_of_discharge. The LC's port_of_loading / port_of_discharge are in the LC
fields block.

DECISION RULES
--------------
PASS when:
  - onboard_notation is non-empty (or pre-printed) AND a valid shipment date
    can be determined AND ports match the LC (if LC ports stated).

FAIL when:
  - No on-board notation is present and the B/L is not pre-printed "shipped
    on board" — UCP 20(a)(ii).
  - The B/L shows an "intended" port or vessel without an overriding on-board
    notation specifying the actual one — ISBP D21.
  - port_of_loading or port_of_discharge differs from the LC value
    (case-insensitive trim; common-name variants such as "Port of Singapore"
    vs "Singapore" are acceptable).

DOUBTS         — shipment_date / onboard_notation extraction is partial or
                 contradictory between slots.
NOT_APPLICABLE — never (this op only fires when BOL is present).

PER-DOC EVIDENCE FORMAT
-----------------------
"BOL: onboard='<text>', shipment_date=<date>, ports=<pol→pod>;
 LC ports=<pol→pod>; verdict_basis=UCP 20(a)(ii|iii) / ISBP D20|D21"

OUTPUT
------
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<one sentence>","confidence":<0.0-1.0>}
