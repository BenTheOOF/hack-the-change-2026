1. Camera-free fall and activity detection with WiFi sensing
 When a person moves, they disturb WiFi signals in a measurable way, called Channel State Information (CSI). Cheap ESP32 boards can capture it. You’d train a model on those signal patterns to detect falls, long periods of no movement, or changes in daily routine for seniors living alone. Nothing is filmed or worn, and caregivers or a neighbour network get an alert.
Hard part: collecting and cleaning CSI data, extracting signal features, and training a small classifier (1D CNN or LSTM) that runs on the device itself.
Why it’s new: most fall detectors need a camera or a wearable, and this needs neither. Your embedded and assembly background is a real advantage here.
Demo: fall onto a mat in front of the judges and an alert pops up on a phone.
2. Group matching that builds connections across circles
 Most social apps match you with people similar to you, which keeps people inside their existing bubbles. This one models a campus or neighbourhood as a social graph and forms small meetup groups of 4–6 people chosen to create bridging ties. Each group shares one interest, but its members come from different parts of the network.
Hard part: graph construction, a constrained optimization problem (integer programming or a heuristic search) balancing shared interests, schedules, location and new connections, plus metrics like clustering coefficient and average path length before and after.
Why it’s new: you’re optimizing the shape of the community’s network, not just individual matches. You can visualize the graph getting more connected over simulated rounds.
Extra: an LLM writes each group a personalized icebreaker or activity plan based on what they have in common.
3. 3D physio coach with clinician feedback
 Turn a phone camera into a home-rehab tool. Monocular 3D pose estimation computes joint angles in real time and compares them to the range-of-motion targets a physiotherapist prescribed. Patients get live corrections, and the clinician sees progress curves on a dashboard.
Hard part: 3D pose lifting, computing joint angles, temporal smoothing, counting reps and segmenting movement phases with something like dynamic time warping against a reference recording, plus the two-sided app.
Why it’s new: it replaces a vague “do 10 squats” with measured recovery data that the physio can act on, which is useful for rural Albertans far from clinics.
Demo: do a shoulder exercise badly, then properly, and the angle graph shows the difference live.
4. Crowdsourced winter accessibility map
 Users snap sidewalk photos, or a phone mounted on a stroller or wheelchair records automatically. A segmentation model detects ice, snow ridges, missing curb cuts and blocked ramps, and the results feed a weighted routing graph that’s updated in real time.
Hard part: training a YOLO or segmentation model on hazard classes, geotagging and deduplicating reports, letting reports decay over time (ice melts during Chinooks), and running a Dijkstra or A* search with accessibility-weighted edges.
Why it’s new: existing accessibility maps are static. This one changes with the weather, which matters a lot in Calgary.
Data angle: the City of Calgary open data portal has sidewalk and curb-ramp layers you could build on.
5. AI agents that organize meetups for you
 Each person has an AI agent that knows their calendar, interests and comfort level. The agents negotiate with each other to set up low-pressure meetups (“three people on your floor are free Thursday and like bouldering”) so nobody has to send the awkward first invite.
Hard part: coordinating multiple agents, solving the scheduling constraints, keeping each person’s data private while agents share only what’s needed, and making the agents’ decisions explainable.
Why it’s new: it removes the scariest step in making friends, which is asking first. “Agents negotiating for you” is also a timely AI angle.
The problem
Employers increasingly want evidence that applicants can actually perform relevant tasks, but self-reported skills and AI-generated resumes don't necessarily establish competence.
At the same time, students, self-taught developers, and career changers struggle to identify which skills they lack and how to demonstrate them.
The solution
An evidence-based skill development platform that connects job-market requirements to small technical challenges and verifies completion using actual project outputs.


The problem
Someone facing a difficult personal situation may need several services at once, such as financial assistance, affordable transportation, healthcare navigation, or language support.
Unfortunately, understanding eligibility requirements, finding contact information, and determining which service to approach first can be difficult.
This affects newcomers, seniors, people with disabilities, and anyone unfamiliar with local service systems.
The solution
Build an accessible, multilingual navigator that converts a user's needs into a verified, actionable support plan.
Unlike a simple resource directory, the system would explain:
Which services may be relevant.
Why each service is being suggested.
What eligibility conditions need confirmation.
What the person should prepare before contacting the organization.
What their next practical action should be.
What the user experience looks like
A user selects:
Example support request
New to Calgary
Needs affordable transportation
Prefers simplified English
Your personalized support pathway
Review the potentially relevant low-income transportation programs.
Check the published eligibility and application requirements.
Find a suitable community organization for additional settlement support.
Generate a simple checklist to prepare for contacting the provider.
Technical design
Use a combination of structured rules and source-grounded language processing.
Component
Proposed implementation
Frontend
React, mobile-first
Service data
Curated Calgary services in JSON
Eligibility matching
Python rule engine
Explanations
Template-based text or Gemini API
Language accessibility
Plain-language rewriting and optional translations
Source trust
URL, verification date, and uncertainty labels

For reliable local information, use the 211 Alberta directory and official City of Calgary newcomer resources. These already provide substantial support information.
Help Starts Here+1
The differentiation should be an accessible, explainable action workflow, not an attempt to replace the existing 211 directory or professional support services.
Hackathon game plan
Phase 1 — Narrow the domain. Focus exclusively on newcomers trying to access financial, transportation, and community services. Select approximately 10–15 services and record their official source URLs.
Phase 2 — Build eligibility filtering. Use known criteria to categorize results as potentially eligible, additional information required, or apparently not eligible. Never present incomplete eligibility rules as definitive.
Phase 3 — Implement a step-by-step navigator. Generate short actions for the user, with direct links and contact details.
Phase 4 — Build accessibility. Add keyboard support, readable fonts, high contrast, simplified language, and responsive design.
Phase 5 — Build a verification view. Let the judges inspect why a service was recommended and which source supports it.
Winning demo
Use a fictional newcomer scenario.
Complete a short needs assessment, receive three relevant services, and demonstrate a personalized action checklist.
Switch to simplified language and show that the important service conditions remain intact.
Then deliberately enter incomplete eligibility information. Show that the system asks for confirmation rather than inventing an answer.
Prize strategy
Clio: This is the leading target. Accessibility, explainability, responsible handling of personal information, and user trust are central to the product.
Benevity: Calgary-specific service information gives the project a tangible local application.
Main risk: A directory with a chatbot is neither particularly original nor sufficiently technical. The rules engine, source verification, and accessible task-completion workflow need to be the real product.
The opportunity is to make AccessPath something more ambitious:
An accessibility-first navigation and case-management system that doesn't just tell people what resources exist, but determines which pathways are actionable, guides them through real-world barriers, and tracks whether they actually receive help.
The distinction is between an AI that provides information and a purpose-built system that helps complete a process.
But even that distinction isn't sufficient on its own. We need defensible engineering that makes the product meaningfully different from ChatGPT, an ordinary directory, or a workflow application.
1. The competition is tougher than it first appears
After looking into existing Calgary services, there's an important issue: much of AccessPath's original functionality already exists.
For example:
211 Alberta already provides a searchable directory of community resources, as well as confidential 24/7 chat with human specialists.
 Help Starts Here+1
City of Calgary already operates Fair Entry, which supports applications for several low-income programs through an online portal.
 fairentry.calgary.ca
The Calgary Food Bank already has appointment and referral processes, with different requirements for first-time and returning clients.
 Calgary Food Bank
So simply adding AI-powered recommendations to these services wouldn't constitute a particularly compelling innovation.
The more interesting problem is that different organizations have different requirements, and users may need to navigate several systems to resolve one situation.
That's where I'd concentrate.
2. Redesign AccessPath around three technical innovations
A. An executable eligibility and dependency engine
Instead of AI guessing which programs someone qualifies for, use structured, source-backed rules to evaluate potential eligibility, missing information, and prerequisites.
For example, the low-income transit pass requires Fair Entry approval, so that dependency becomes part of an executable workflow.
https://www.calgary.ca
B. A document and application-readiness engine
Identify which documents each process requires, where requirements overlap, and what prevents someone from proceeding.
The user could see that they already have appropriate identification but still need acceptable income documentation for Fair Entry. The system would explain what information is missing and cite the official requirement.
https://www.calgary.ca
C. A stateful, adaptive support workflow
Rather than ending with a list of recommendations, the system would remember which steps the user reports completing and automatically update the remaining pathway.
If an application is pending, a document is missing, or a user is ineligible for a particular service, the workflow should respond accordingly rather than repeatedly generating the same recommendations.
This changes the product from a chatbot into a rules-driven navigation and workflow engine with AI as an optional interface.
3. A concrete example of how it would work
Imagine a fictional Calgary resident who recently lost their job, has limited money for transportation, and needs immediate food assistance.
AccessPath identifies two actionable support paths.
Personalized support workflow
Illustrative user state; service requirements are drawn from official sources.
Emergency food assistance
First-time clients of the Calgary Food Bank must book by phone. The system presents the booking instructions and required information, then lets the user mark the call as completed.
Calgary Food Bank
Fair Entry application preparation
Check Calgary residency and acceptable income documentation. Indicate any missing documents before directing the user to the official application.
https://www.calgary.ca
Low-income transit pass
This step remains blocked until Fair Entry approval is confirmed. Once the user reports approval, AccessPath unlocks the official purchase instructions.
Calgary Transit
The important part is what happens when the user's circumstances change.
If they don't have acceptable income documentation, AccessPath doesn't just say, "Apply for Fair Entry." It identifies the blocker, shows the official alternatives, and updates the task sequence.
If they later confirm that Fair Entry has approved their application, the system unlocks the transit-pass step.
The technical value comes from managing dependencies and changing application state, not from generating text.
The prototype must not imply that clicking "completed" actually submits an application, books an appointment, or verifies an approval. Those actions would require authorized integrations with service providers.
4. How it would compare with ChatGPT
Capability
General ChatGPT interaction
Redesigned AccessPath
Explain available services
Yes
Yes
Recommend relevant resources
Yes
Yes
Evaluate eligibility
Can interpret rules, but may make mistakes
Deterministic rules with sources and explicit unknowns
Detect workflow dependencies
Can reason about them
Stored and executed as a dependency graph
Track application progress
Possible with explicit updates
Built into the product's workflow state
Automatically recalculate blocked steps
Possible when prompted
Core engine behaviour
Verify official application status
Not inherently
Not without authorized integration
Provide accessibility features
General-purpose interface
Designed and tested for a specific user population

To be fair, ChatGPT could perform many of these tasks with enough prompting, tools, and memory. And a conventional application could implement the same rules.
The differentiator is not that ChatGPT is incapable of doing it. It's that AccessPath provides an integrated, repeatable, independently testable process designed for this specific problem.
That's a much more credible engineering argument.
5. What would make this hackathon-worthy?
I would build the system around four components:
Accessible user interface
Guided questions, plain language, keyboard navigation
Eligibility engine
Deterministic rules and evidence
Workflow engine
Prerequisites, blockers and progress
Verified local service database
Official requirements, citations and review dates
I'd use Python with FastAPI for the rules and workflow engines, React for the frontend, and SQLite for a compact prototype.
The data model could explicitly represent each program's requirements, prerequisites, source URLs, and review dates. A graph traversal algorithm could then determine which tasks are actionable and which are blocked.
You could write automated tests for cases like missing income evidence, a pending Fair Entry application, or a first-time Food Bank client.
That demonstrates real software engineering.
Where AI should fit
AI could help with two narrow tasks: converting complicated official requirements into simpler language and translating user-facing instructions.
But it should never be the authority for eligibility, invent unsupported alternatives, or silently change verified program rules.
In fact, an impressive demo would be to turn the AI component off and show that the core application still works.
6. What I would build within the hackathon
I would limit the prototype to just three service pathways:
Calgary Fair Entry.
Calgary's low-income transit pass.
Calgary Food Bank emergency hampers.
These are enough to demonstrate multiple organizations, prerequisite chains, and different user circumstances.
For the first version, I would not implement document uploads, OCR, automatic form submission, or real account integration. Use fictional user profiles and simple checkboxes indicating which document types a user possesses, without collecting their actual financial records.
The centerpiece of the three-minute judging presentation would be a live change in the user's situation:
First run: The system detects a missing prerequisite and blocks the next action.
Second run: The user updates their information, and the engine recalculates the pathway.
Third run: A completed step unlocks a different service.
This would demonstrate genuine functionality rather than just showing AI-generated text.
7. Would I recommend it now?
I would rate the two versions quite differently:
Dimension
Original AccessPath
Redesigned AccessPath
Distinctiveness
2/5
4/5
Technical depth
2/5
4.5/5
Local relevance
4/5
4.5/5
Accessibility potential
4/5
5/5
Hackathon feasibility
4.5/5
4/5

These are my estimates rather than actual judging scores.
There is still an important challenge: existing human navigators, particularly 211 specialists, already help people navigate complex circumstances. The product should therefore be positioned as a self-service preparation and progress-management tool that complements existing organizations, rather than claiming to replace them.
And beyond the hackathon, we'd need to validate whether real users actually struggle with the specific cross-service workflows we choose.
My preferred pitch would be:
AccessPath helps people navigate complex social-support systems using verified eligibility rules, adaptive task planning, and accessible guidance. Instead of merely finding resources, it identifies what a person can do now, what is preventing the next step, and how to move forward.
That is a meaningfully stronger concept.
The biggest opportunity to make it even more original is a cross-service dependency engine: instead of treating each resource independently, AccessPath understands how applications, documentation, approvals, and support services interact.
https://chatgpt.com/share/6aef7b9b-fa7c-83e8-bec2-41d13d6c0f47
Here's my idea: A web app that helps people plan events/hangouts for people who are looking for a job. Then, we invite small companies/startups out to connect with potential applicants, as they require lots of hiring when they’re scaling.
Target small companies because it is hard for them to connect with applicants on Job Expo since most of the applicants will go to big companies' spots.
	It could also be a social connection platform

https://claude.ai/share/c86abc72-e07a-4d92-ac4e-73b395e4c44a
https://chatgpt.com/share/6aef8935-4520-83e8-be17-f06f302ad4c5

