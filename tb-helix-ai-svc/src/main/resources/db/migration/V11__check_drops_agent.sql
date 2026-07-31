-- A check no longer names an agent.
--
-- `agentId` / `groupId` sat on the check document, which put an examination's
-- input in the position of declaring which console grouping it belonged to.
-- Nothing in lc-check reads either key — the plan selects rule cards from the
-- catalogue and execute runs them by tier — so every check row carried two
-- fields that only the Agents screen has ever looked at, and any consumer
-- reading a check had to know to ignore them.
--
-- The link is not deleted, it is inverted: the group names the checks it holds.
-- That is the direction that was always true — an agent is a way of arranging
-- checks, so the arrangement belongs to the agent, and a check is the same check
-- whether or not anybody has filed it. Agents keep working with exactly the
-- arrangement they had; a check document is now only the rule.

-- Fold each check's placement into the group that claimed it. WITH ORDINALITY
-- so the groups come back in the order they were stored, not the order the
-- planner happens to produce.
UPDATE helix_gov.document a
   SET body = jsonb_set(a.body, '{groups}', COALESCE(folded.groups, '[]'::jsonb)),
       updated_at = NOW()
  FROM (
      SELECT d.id AS agent_id,
             jsonb_agg(
                 g.value || jsonb_build_object('checks', COALESCE(held.ids, '[]'::jsonb))
                 ORDER BY g.ord
             ) AS groups
        FROM helix_gov.document d
        CROSS JOIN LATERAL jsonb_array_elements(d.body -> 'groups') WITH ORDINALITY AS g(value, ord)
        LEFT JOIN LATERAL (
             SELECT jsonb_agg(c.id ORDER BY c.id) AS ids
               FROM helix_gov.document c
              WHERE c.kind = 'check'
                AND c.body ->> 'groupId' = g.value ->> 'gid'
        ) held ON TRUE
       WHERE d.kind = 'agent'
         AND jsonb_typeof(d.body -> 'groups') = 'array'
       GROUP BY d.id
  ) folded
 WHERE a.kind = 'agent' AND a.id = folded.agent_id;

UPDATE helix_gov.document
   SET body = body - 'agentId' - 'groupId',
       updated_at = NOW()
 WHERE kind = 'check'
   AND (body ? 'agentId' OR body ? 'groupId');
