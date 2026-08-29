# Crisis Agent — Project Context

## Project Summary

This is a **2-week hackathon project** built as a **React Native Android app** using the **Strands SDK**.

The app is a **location-based personal crisis response agent**. The expected use case is that the user already knows or suspects that an emergency is happening nearby — for example a wildfire, flood, earthquake, or severe weather event — and opens the app to understand:

1. **What is happening near me?**
2. **Does it currently affect my location?**
3. **What should I do next?**

The app is **not primarily a background alerting system**. The user manually taps **Refresh / Sync** to retrieve the latest crisis information.

Core product promise:

> **One refresh should tell the user what is happening, whether it affects their location, what changed, and what they should do next.**

---

## Core User Flow

1. User hears about a possible nearby emergency.
2. User opens the app.
3. App obtains the user's current location.
4. User taps **Refresh / Sync**.
5. Strands agent checks trusted disaster data sources.
6. Relevant hazards are filtered for the user's location.
7. App generates a concise crisis brief and suggested action plan.
8. Previous state is saved so future refreshes can explain **what changed**.
9. User can ask follow-up questions through crisis-specific chat.

Conceptually:

```text
User location
    ↓
Manual Refresh
    ↓
Strands agent + tools
    ↓
Retrieve authoritative hazard data
    ↓
Determine geographic relevance
    ↓
Compare with previous state
    ↓
Generate structured crisis brief
    ↓
Render in React Native UI
```

---

## MVP Features

Prioritize these features:

- Current user location
- Manual Refresh / Sync
- Nearby crisis detection
- National Weather Service alerts
- USGS earthquake data
- Wildfire data
- Geographic relevance filtering
- Large map on the Home screen
- Crisis status
- Suggested action plan
- "What changed since last refresh"
- Source attribution
- Crisis-specific chat
- Structured Strands output
- Controlled/mock demo mode

Do **not** prioritize unless the core MVP is already complete:

- Background monitoring
- Push notifications
- Continuous GPS
- Family location sharing
- Community/social reporting
- Automated emergency calls
- Insurance workflows
- Advanced evacuation routing
- Nationwide shelter aggregation
- Large multi-agent orchestration systems

---

## Main UI Structure

Likely bottom navigation:

```text
Home | Map | Ask
```

### Home

The **map is a key feature and should be prominent on the Home screen**, not just a small thumbnail.

Recommended information hierarchy:

1. Current location / last updated / Refresh
2. Large map
3. Current crisis status
4. Official situation summary
5. Immediate action plan
6. What changed since previous refresh
7. Sources
8. Entry point to chat

Example crisis state:

```text
San Jose, CA
Updated 2:24 PM

PREPARE

Canyon Fire
Wildfire · 8.4 mi away

Official:
An evacuation warning has been issued nearby.
Your current location is not under an evacuation order.

What to do now:
- Gather essential medications and identification
- Charge your phone and backup battery
- Keep important belongings ready
- Continue monitoring evacuation updates

Since your last refresh:
- Fire grew by 1,100 acres
- Warning expanded south
- New road closure reported
- Your evacuation status is unchanged
```

### Map

The map should help answer:

> **Where is the crisis relative to me, and does it affect me?**

Possible layers:

- User location
- Wildfire location/perimeter
- Official warning polygons
- Evacuation warning areas
- Evacuation order areas

Keep the map relatively simple for the hackathon. Do not build a full GIS dashboard.

### Ask / Chat

The chat is grounded in the **current crisis context**, not a generic chatbot.

Example questions:

- Am I in an evacuation zone?
- Do I need to leave?
- How far away is the fire?
- What should I pack?
- What changed since my last refresh?
- What does this warning mean?
- Why are you telling me to prepare?
- Where did this information come from?

Situation-specific factual answers must use retrieved data rather than model memory.

---

## Crisis Status Model

Possible simplified state system:

```text
CLEAR → AWARE → PREPARE → ACT → RECOVER
```

### CLEAR
No relevant major threat currently affects the user.

### AWARE
Something is happening nearby, but no immediate official action is required.

### PREPARE
Official warnings or worsening conditions indicate the user should prepare.

### ACT
An authoritative instruction relevant to the user's location applies.

### RECOVER
Immediate danger has passed, but recovery-related information may still matter.

Important:

**The AI must not independently invent evacuation orders.**

For example:

Good:
> "An official evacuation order includes your current location."

Bad:
> "The AI has decided you should evacuate."

---

## Disaster Data Sources

### National Weather Service (NWS)

Use for:

- Severe weather
- Tornadoes
- Floods
- Hurricanes
- Extreme heat
- Winter weather
- Other NWS alerts

Typical location-based query concept:

```text
GET /alerts/active?point={latitude},{longitude}
```

Useful fields include:

- event
- severity
- urgency
- certainty
- headline
- description
- instructions
- effective time
- expiration time
- geometry / affected area

Official warning existence should come from the API, not from the LLM.

### USGS

Use USGS GeoJSON feeds for recent earthquakes.

Normal code should calculate:

- Distance from user
- Relevance threshold
- Sorting/filtering

Do not ask the LLM to perform basic geospatial math.

### Wildfire Data

Use public wildfire data such as **NIFC / WFIGS**.

Potential values:

- Incident name
- Latitude / longitude
- Fire perimeter
- Acreage
- Containment
- Update time

NASA FIRMS may be added later but is not required for MVP.

Do not make FEMA IPAWS a required hackathon dependency.

---

## Strands SDK Role

The project must use Strands in a meaningful way.

Prefer **one primary crisis agent with tools** rather than creating many agents unnecessarily.

Possible tools:

```text
get_weather_alerts(latitude, longitude)
get_nearby_wildfires(latitude, longitude)
get_nearby_earthquakes(latitude, longitude)
get_previous_crisis_state()
save_crisis_state()
get_official_preparedness_guidance(disaster_type)
```

Optional later:

```text
get_road_closures()
get_local_emergency_information()
get_nearby_shelters()
```

### Good uses of Strands

Use the agent for:

- Deciding which retrieved information is meaningful
- Synthesizing multiple alerts
- Selecting relevant official guidance
- Explaining the situation clearly
- Generating a concise action plan
- Explaining what materially changed
- Handling grounded follow-up questions

### Do NOT use the LLM for deterministic work

Normal code should handle:

- Distance calculations
- Point-in-polygon checks
- Whether user is inside an official warning zone
- Alert expiration
- Deduplication
- Sorting
- Timestamp comparison
- Structured diffs between refreshes

---

## Structured Output

Prefer structured agent output instead of arbitrary prose.

Conceptual response:

```json
{
  "status": "prepare",
  "headline": "Wildfire near your area",
  "summary": "...",
  "primary_hazard": {
    "type": "wildfire",
    "name": "Canyon Fire",
    "distance_miles": 8.4
  },
  "official_status": {
    "message": "...",
    "source": "..."
  },
  "actions": [
    "...",
    "...",
    "..."
  ],
  "changes": [
    "...",
    "..."
  ],
  "sources": []
}
```

Adjust the exact schema to fit the existing codebase rather than rewriting working code unnecessarily.

---

## Safety & Trust

Always distinguish:

### Official Information

Facts retrieved from authoritative sources.

Example:

> Santa Clara County has issued an evacuation warning for this area.

### Agent Guidance

Interpretation or suggested preparation based on those facts.

Example:

> Gather essential belongings and be ready to leave quickly if an official evacuation order is issued.

Important factual claims should include:

- Source
- Updated time where available

Do not allow the agent to present unsupported emergency claims as official information.

---

## "What Changed" Feature

This is a core product differentiator.

Each refresh should save the previous crisis state.

The next refresh should compare old vs new state and surface only meaningful differences.

Example:

```text
Since your last refresh:

- Fire grew from 3,100 to 4,200 acres
- Evacuation warning expanded south
- New road closure reported
- Your evacuation status is unchanged
```

Or:

```text
No significant changes since your last refresh.
```

Prefer deterministic diffing first, then use Strands to turn the diff into a concise explanation.

---

## Refresh UX

Refresh is manually triggered by the user.

During Refresh, the UI may display **high-level workflow events**, for example:

```text
Getting your location
Checking official weather alerts
Checking nearby wildfires
Checking recent earthquakes
Comparing with your previous update
Updating your action plan
```

These should represent actual tool/workflow activity.

Do **not** expose hidden chain-of-thought.

---

## Demo Mode

Because a real crisis may not exist near the judging location, support a controlled/mock scenario if practical.

Example progression:

### Refresh 1
AWARE  
Wildfire 14 miles away. No evacuation warning.

### Refresh 2
PREPARE  
Fire is now 9 miles away and an official warning has expanded nearby.

### User asks
> Do I need to leave?

Agent explains that no official evacuation order currently applies.

### Refresh 3
ACT  
An official evacuation order now includes the mock user location.

Ideally, demo mode should reuse the same structured output/UI pipeline as live data.

---

# Repository Architecture Rules

Current intended structure:

```text
my-react-native-app/
├── android/
├── ios/
├── src/
│   ├── agents/
│   │   ├── tools/
│   │   │   └── deviceTools.ts
│   │   ├── index.ts
│   │   └── client.ts
│   ├── components/
│   ├── screens/
│   └── App.tsx
├── package.json
└── tsconfig.json
```

## Required conventions

### UI Components

**All reusable UI components must go in:**

```text
src/components/
```

Do not create feature-specific component folders elsewhere unless explicitly requested.

Screens should compose components from `src/components/`.

### Hooks

If custom React hooks are needed, create:

```text
src/hooks/
```

Examples:

```text
src/hooks/useLocation.ts
src/hooks/useCrisisRefresh.ts
src/hooks/useCrisisState.ts
```

Do not place hooks inside `components/`, `screens/`, or `agents/`.

### Agents

Keep Strands integration inside:

```text
src/agents/
```

Custom agent tools should remain inside:

```text
src/agents/tools/
```

Suggested responsibilities:

```text
src/agents/client.ts
→ Model / Bedrock / Strands configuration

src/agents/index.ts
→ Agent initialization and exports

src/agents/tools/
→ Tool definitions and external data integrations
```

### Screens

Full-screen app views belong in:

```text
src/screens/
```

### Existing Code

Before making large changes:

1. Inspect the repository.
2. Understand what is already implemented.
3. Preserve working functionality.
4. Prefer incremental changes over rewrites.
5. Reuse existing types, components, and patterns when sensible.
6. Keep architecture simple enough for a 2-week hackathon.
7. Avoid unnecessary abstractions or production-scale infrastructure.

---

## Engineering Priorities

When choosing between technically elegant and hackathon-practical approaches, prioritize:

1. Reliability
2. Clear demo
3. Fast implementation
4. Maintainable enough code
5. Minimal unnecessary infrastructure

Do not overengineer.

The core experience must work before adding stretch features.

---

## Guidance for Codex

When starting a new task:

1. Read this file first.
2. Inspect relevant existing code before modifying it.
3. State what is already implemented and what needs to change.
4. Preserve existing architecture unless there is a strong reason not to.
5. Follow the repository rules in this file.
6. Keep the hackathon scope in mind.

The guiding product question is:

> **How can this app turn fragmented, location-specific emergency information into one clear answer: what is happening, what changed, and what should I do next?**
