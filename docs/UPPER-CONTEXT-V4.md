# Upper structure and internal CHoCH — v4

The common plan now carries confirmed 4H/1H swing trends, internal directions, last internal events, latest internal CHoCH price/time, and position-relative phase classification. Lower M1/M5 readiness alone cannot pass the upper confirmation.

Implementation setting (not a universal lecture rule): H4 swing and H1 internal direction must align with the proposed continuation trade; at least one of H4 or H1 must retain an aligned internal CHoCH. BOS-only initialization is not CHoCH confirmation. A frame whose latest internal direction opposes its old CHoCH cannot supply approval. H1 swing is context, not an extra alignment gate. CC/CP countertrend execution is not enabled; all four phases remain classified relative to position.

No claim that this implements every lecture entry. The existing latest-CHoCH/tie preference used for phase classification remains a documented site convention. No new CHoCH-after-contact timing rule is invented here. Existing M15 contact and lower-timeframe sequences, original upper risk plan and price validation remain.

New auto experiments use H4-H1-internal-choch-refined-entry-v4. Existing v3/v2/v1 runs retain their rules and saved positions. New backtests use v4 through the same advanceAuto engine. The after-close scanner uses the same common-plan evaluator; archived reports retain their historical content.

65 initial regression tests cover phase classification, no-future confirmation, upper CHoCH confirmation, legacy risk behavior, and v4 rejection of BOS-only entries. Existing confirmed-bar validation extracted unchanged to avoid circular imports.
