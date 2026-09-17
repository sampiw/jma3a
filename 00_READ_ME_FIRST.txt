JMA3A AGENT PACK
================

Give these files to your coding agent:

1. 01_JMA3A_MASTER_BUILD_PROMPT.txt
   The complete product, architecture, game, security, QA, GitHub, and Vercel build contract.

2. 02_JMA3A_AGENT_ENV_TEMPLATE.txt
   Copy this privately to `.agent.env` and fill in the REAL credentials.
   NEVER commit `.agent.env`.

3. 03_JMA3A_DEPLOYMENT_ACCEPTANCE_CHECKLIST.txt
   The agent must use this before claiming the product is finished.

4. 04_JMA3A_CONTENT_REQUIREMENTS.txt
   Original content minimums and safety/quality rules for the non-DIB games.

RECOMMENDED USAGE
-----------------
Send the master prompt to the agent and attach the other three files.

Tell it:
"Use 01 as the source of truth. Read 02 for the environment contract,
04 for content requirements, and do not claim completion until 03 passes."

PRIVATE ENV FILE
----------------
Create:
.agent.env

Fill in the actual GitHub, Vercel, database, Redis, and application secrets.

Do NOT upload a real credential-filled file to a public repository.
Do NOT commit it.

DOMAINS
-------
Working brand: JMA3A

Future commercial targets:
jma3a.ma
jma3a.com

These are targets only. Do not assume availability or ownership.
Initial production can use the Vercel domain.

STACK NOTE
----------
The master prompt deliberately tells the agent to verify the current official
Vercel realtime API at execution time. Realtime infrastructure changes faster
than game/domain architecture; the app must keep realtime behind an adapter.

END
