export const TERMS = {
    affordance: { label: "Affordance", definition: "Access or capability assumed to be available to an agent in a particular setting. This does not establish that access was actually granted or used." },
    component: { label: "Component", definition: "A part of the system, such as a package manager, model, or network." },
    stage: { label: "Stage", definition: "An activity or phase of AI development, such as training, evaluation, or deployment. It provides context for an agent's access and actions." },
    "failure-mode": { label: "Failure mode", definition: "An action by an agent that can contribute to harm." },
    condition: { label: "Condition", definition: "A state that an action relies on or produces. A condition can remain true after the action ends." },
    outcome: { label: "Outcome", definition: "The consequence represented by a combination of conditions. An outcome label is not a probability estimate." },
    prerequisite: { label: "Prerequisite", definition: "Something an argument requires to hold. AND means requirements must hold together; OR means there are alternative sets of requirements." },
    assumption: { label: "Assumption", definition: "Something taken to hold for an analysis without treating it as an observation. Changing an assumption can change which paths are available." },
    "evidence-status": { label: "Evidence status", definition: "The review state of map content. This is distinct from a case author's assessment of a claim, and does not establish whether the claim is true or false." },
} as const;
export type TermName = keyof typeof TERMS;
